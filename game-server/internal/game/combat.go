package game

import (
	"encoding/json"
	"log"
	"math"
	"slices"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// Combat on a layer: using abilities, casts and channels, what lands and when. Clients say what
// they want to use; everything else is worked out here, against where the server has everyone.

const (
	CombatTick     = 50 * time.Millisecond
	strikeDelay    = 300 * time.Millisecond // how far into its attack clip a melee hit lands
	dummyHealth    = 100000.0
	dummyResetIdle = 5 * time.Second // a dummy heals up and its tally starts over after this long unhit
	resourceEvery  = 500 * time.Millisecond
	playLevel      = 1 // everyone's level, until there's levelling
)

// vitals are what can be hurt and healed: a player's, or a dummy's.
type vitals struct {
	ID        int64
	Health    float64
	MaxHealth float64
	Statuses  map[string]*activeStatus
}

// activeStatus is a status on a unit, until it runs out.
type activeStatus struct {
	class string
	until time.Time
}

// dummy is a training dummy: it takes damage, never dies or fights back, and tallies who's hit it.
type dummy struct {
	vitals
	state    Character
	firstHit time.Time
	lastHit  time.Time
	damage   float64
}

// fighter is a player's part in combat.
type fighter struct {
	class      *combat.Class
	stats      combat.Stats
	vitals     vitals
	resources  map[string]float64
	sentAt     time.Time
	resChanged bool
	gcdUntil   time.Time
	cooldowns  map[string][]time.Time // when each spent charge of an ability comes back
	cast       *casting
}

// casting is a cast or channel under way.
type casting struct {
	ability  *combat.Ability
	target   int64
	spot     *[3]float64
	release  time.Time // when a cast lets go
	ends     time.Time // when it stops: the release, or the channel's end
	channel  bool
	released bool
	stopped  bool
}

// landing is something that happens at a time: a hit arriving, a channel's tick.
type landing struct {
	at   time.Time
	cast *casting // when it stops with a channel
	run  func(now time.Time)
}

// enterFight gives a player its class's numbers. Until characters pick a class, each plays the
// world's first.
func (p *Player) enterFight(classes []*combat.Class) {
	f := &p.fight
	f.vitals = vitals{ID: p.state.ID, Statuses: map[string]*activeStatus{}}
	f.resources, f.cooldowns = map[string]float64{}, map[string][]time.Time{}
	if len(classes) == 0 {
		f.vitals.MaxHealth, f.vitals.Health = 100, 100
		return
	}
	f.class = classes[0]
	f.stats = combat.StatsFor(f.class, playLevel)
	f.vitals.MaxHealth, f.vitals.Health = f.stats.MaxHealth, f.stats.MaxHealth
	for _, r := range f.class.Resources {
		f.resources[r.Key] = combat.StartResource(r)
	}
	p.state.Class, p.state.Health, p.state.MaxHealth = f.class.ID, f.vitals.Health, f.vitals.MaxHealth
}

// placeDummies puts a world's training dummies on the layer, standing on the ground.
func (l *Layer) placeDummies() {
	if l.dummies != nil {
		return
	}
	l.dummies = []*dummy{}
	for i, d := range l.world.Dummies {
		at := [3]float64{d.At[0], 0, d.At[1]}
		if g := l.ground(d.Continent); g != nil {
			if s, ok, err := g.At(at[0], at[2]); ok && err == nil {
				at[1] = s.Ground
			}
		}
		id := int64(-1 - i) // characters' ids are positive
		l.dummies = append(l.dummies, &dummy{
			vitals: vitals{ID: id, Health: dummyHealth, MaxHealth: dummyHealth, Statuses: map[string]*activeStatus{}},
			state:  Character{ID: id, Name: "Training Dummy", Look: json.RawMessage(`{"body":"goblin"}`), Continent: d.Continent, At: at, Move: Move{Gait: "run"}, Dummy: true, Health: dummyHealth, MaxHealth: dummyHealth},
		})
	}
}

func (l *Layer) dummiesOn(continent string) []Character {
	out := []Character{}
	for _, d := range l.dummies {
		if d.state.Continent == continent {
			out = append(out, d.state)
		}
	}
	return out
}

// use starts the ability a player asks for, or says why it can't.
func (l *Layer) use(p *Player, m incoming) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.players[p.ID()] != p {
		return
	}
	now := l.hub.now()
	ability, target, why := l.check(p, m, now)
	if why != "" {
		p.send(encode(refused{"refused", m.Ability, why}))
		return
	}
	f := &p.fight
	gcd := combat.GCDSeconds
	if ability.GCD != nil {
		gcd = *ability.GCD
	}
	if gcd > 0 {
		f.gcdUntil = now.Add(seconds(gcd))
	}
	l.tell(p, encode(used{Type: "used", ID: p.ID(), Class: f.class.ID, Ability: ability.ID, Target: target, Spot: m.Spot, GCD: gcd}))
	c := &casting{ability: ability, target: target, spot: m.Spot, release: now.Add(seconds(ability.CastTime)), channel: ability.Channel != nil}
	c.ends = c.release
	if c.channel {
		c.ends = c.release.Add(seconds(ability.Channel.Duration))
	}
	if ability.CastTime > 0 {
		f.cast = c
		return
	}
	l.release(p, c, now)
}

// check says whether a player can use an ability now: the ability and its target, or why not.
func (l *Layer) check(p *Player, m incoming, now time.Time) (*combat.Ability, int64, string) {
	f := &p.fight
	if f.class == nil {
		return nil, 0, "you have no class"
	}
	ability := f.class.Ability(m.Ability)
	if ability == nil {
		return nil, 0, "you don't know that"
	}
	if f.cast != nil {
		return nil, 0, "you're busy"
	}
	gcd := combat.GCDSeconds
	if ability.GCD != nil {
		gcd = *ability.GCD
	}
	if gcd > 0 && now.Before(f.gcdUntil) {
		return nil, 0, "not ready yet"
	}
	if len(live(f.cooldowns[ability.ID], now)) >= max(ability.Charges, 1) {
		return nil, 0, "not ready yet"
	}
	if why := l.affordable(f, ability); why != "" {
		return nil, 0, why
	}
	waits := ability.CastTime > 0 || ability.Channel != nil
	if waits && !ability.CastWhileMoving && movingNow(p.state.Move) {
		return nil, 0, "you can't do that while moving"
	}
	var target int64
	var at [3]float64
	switch ability.Target {
	case "enemy":
		d := l.dummy(m.Target, p.state.Continent)
		if d == nil {
			return nil, 0, "you need an enemy targeted"
		}
		target, at = d.ID, d.state.At
	case "ally":
		o := l.players[m.Target]
		if o == nil || o.state.Continent != p.state.Continent {
			o = p // with no ally targeted, it goes on you
		}
		target, at = o.ID(), o.state.At
	case "ground":
		if m.Spot == nil || !finite(*m.Spot, 0, 0) {
			return nil, 0, "you need to pick a spot"
		}
		at = *m.Spot
	default:
		return ability, 0, ""
	}
	gap := distance(p.state.At, at)
	reach := ability.Range.Feet
	if ability.Range.Melee {
		reach = combat.MeleeFt
	}
	if (reach > 0 && gap > reach) || gap < ability.MinRange {
		return nil, 0, "out of range"
	}
	if needsFacing(ability) && !facing(p.state.At, p.state.Yaw, at) {
		return nil, 0, "you're not facing it"
	}
	return ability, target, ""
}

func needsFacing(a *combat.Ability) bool {
	if a.Facing != nil {
		return *a.Facing
	}
	return a.Target == "enemy"
}

// affordable says what the ability needs that the fighter hasn't got.
func (l *Layer) affordable(f *fighter, a *combat.Ability) string {
	for _, cost := range a.Cost {
		if f.resources[cost.Resource] < costOf(f, cost) {
			return "not enough " + cost.Resource
		}
	}
	return ""
}

func costOf(f *fighter, cost combat.Cost) float64 {
	if cost.Percent <= 0 {
		return cost.Amount
	}
	for _, r := range f.class.Resources {
		if r.Key == cost.Resource {
			return combat.MaxResource(r) * cost.Percent / 100
		}
	}
	return 0
}

// release lets go of a cast: it spends what the ability costs, starts its cooldown, and sets off
// what lands.
func (l *Layer) release(p *Player, c *casting, now time.Time) {
	f := &p.fight
	a := c.ability
	c.released = true
	if why := l.affordable(f, a); why != "" {
		f.cast = nil
		p.send(encode(refused{"refused", a.ID, why}))
		l.tell(p, encode(stopped{"stopped", p.ID()}))
		return
	}
	for _, cost := range a.Cost {
		f.resources[cost.Resource] -= costOf(f, cost)
		f.resChanged = true
	}
	if a.Cooldown > 0 {
		spent := live(f.cooldowns[a.ID], now)
		from := now
		if len(spent) > 0 {
			from = spent[len(spent)-1]
		}
		f.cooldowns[a.ID] = append(spent, from.Add(seconds(a.Cooldown)))
		p.send(encode(cooldown{"cooldown", a.ID, a.Cooldown}))
	}
	if c.channel {
		f.cast = c
		ticks := max(a.Channel.Ticks, 1)
		for n := 1; n <= ticks; n++ {
			at := now.Add(seconds(a.Channel.Duration * float64(n) / float64(ticks)))
			l.after(at, c, func(now time.Time) { l.landAll(p, c, now, false) })
		}
		return
	}
	f.cast = nil
	strike := now
	if a.Range.Melee {
		strike = now.Add(strikeDelay)
	}
	flight := strike
	if a.Speed > 0 {
		if at, ok := l.pointOf(c, p); ok {
			flight = strike.Add(seconds(distance(p.state.At, at) / a.Speed))
		}
	}
	// What flies lands when it arrives; the rest as it's let go.
	l.after(strike, nil, func(now time.Time) { l.landAll(p, c, now, true) })
	if flight != strike {
		l.after(flight, nil, func(now time.Time) { l.landArriving(p, c, now) })
	} else {
		l.after(strike, nil, func(now time.Time) { l.landArriving(p, c, now) })
	}
}

func (l *Layer) after(at time.Time, c *casting, run func(time.Time)) {
	l.landings = append(l.landings, &landing{at: at, cast: c, run: run})
}

// pointOf is where an ability's going: its unit or its spot.
func (l *Layer) pointOf(c *casting, p *Player) ([3]float64, bool) {
	if c.spot != nil {
		return *c.spot, true
	}
	if d := l.dummy(c.target, p.state.Continent); d != nil {
		return d.state.At, true
	}
	if o := l.players[c.target]; o != nil {
		return o.state.At, true
	}
	return [3]float64{}, false
}

// arrives says whether an effect lands when a projectile arrives, as the client's timeline has it.
func arrives(a *combat.Ability, e *combat.Effect) bool {
	return a.Speed > 0 && e.Affects == "target" && (a.Target == "enemy" || a.Target == "ally")
}

// landAll lands an ability's effects, other than those flying if leaveFlying says so.
func (l *Layer) landAll(p *Player, c *casting, now time.Time, leaveFlying bool) {
	if l.players[p.ID()] != p {
		return
	}
	for i := range c.ability.Effects {
		e := &c.ability.Effects[i]
		if !leaveFlying || !arrives(c.ability, e) {
			l.land(p, c, e, now)
		}
	}
}

func (l *Layer) landArriving(p *Player, c *casting, now time.Time) {
	if l.players[p.ID()] != p {
		return
	}
	for i := range c.ability.Effects {
		if e := &c.ability.Effects[i]; arrives(c.ability, e) {
			l.land(p, c, e, now)
		}
	}
}

// land does one effect to everyone it reaches. Effects that aren't here yet do nothing.
func (l *Layer) land(p *Player, c *casting, e *combat.Effect, now time.Time) {
	f := &p.fight
	for _, on := range l.reached(p, c, e) {
		h := hit{Type: "hit", From: p.ID(), Ability: c.ability.ID, On: on.ID, Effect: e.Type}
		switch e.Type {
		case "damage":
			n, crit := combat.Roll(e.Amount, f.stats, true, l.hub.roll)
			on.Health = max(on.Health-n, 0)
			h.Amount, h.Crit = math.Round(n), crit
			if d := l.dummy(on.ID, p.state.Continent); d != nil {
				d.tally(n, now)
				h.DPS = math.Round(d.dps(now))
				on.Health = max(on.Health, 1) // it never dies
			}
		case "heal":
			n, crit := combat.Roll(e.Amount, f.stats, true, l.hub.roll)
			on.Health = min(on.Health+n, on.MaxHealth)
			h.Amount, h.Crit = math.Round(n), crit
		case "resource":
			n, _ := combat.Roll(e.Amount, f.stats, false, l.hub.roll)
			if l.addResource(f, e.Resource, n) {
				h.Amount, h.Resource = math.Round(n), e.Resource
			}
		case "status":
			s := f.class.Status(e.Status)
			if s == nil {
				log.Printf("character %d: ability %s applies a status its class hasn't got: %s", p.ID(), c.ability.ID, e.Status)
				continue
			}
			lasts := e.Duration
			if lasts == 0 {
				lasts = s.Duration
			}
			if lasts > 0 {
				on.Statuses[s.ID] = &activeStatus{class: f.class.ID, until: now.Add(seconds(lasts))}
			}
			h.Status, h.Lasts, h.Class = s.ID, lasts, f.class.ID
		default:
			continue
		}
		h.Health, h.MaxHealth = math.Round(on.Health), on.MaxHealth
		l.sync(on)
		l.tell(p, encode(h))
	}
}

func (l *Layer) addResource(f *fighter, key string, n float64) bool {
	for _, r := range f.class.Resources {
		if r.Key == key {
			f.resources[key] = max(0, min(combat.MaxResource(r), f.resources[key]+n))
			f.resChanged = true
			return true
		}
	}
	return false
}

// sync puts what's been done to a unit where those arriving will see it.
func (l *Layer) sync(on *vitals) {
	if on.ID < 0 {
		if d := l.dummy(on.ID, ""); d != nil {
			d.state.Health = on.Health
		}
		return
	}
	if o := l.players[on.ID]; o != nil {
		o.state.Health = on.Health
	}
}

func (d *dummy) tally(n float64, now time.Time) {
	if d.firstHit.IsZero() {
		d.firstHit = now
	}
	d.lastHit, d.damage = now, d.damage+n
}

// dps is damage a second since the first hit, counting that first hit as a full second.
func (d *dummy) dps(now time.Time) float64 {
	return d.damage / max(1, now.Sub(d.firstHit).Seconds())
}

// reached is who an effect lands on.
func (l *Layer) reached(p *Player, c *casting, e *combat.Effect) []*vitals {
	switch e.Affects {
	case "self":
		return []*vitals{&p.fight.vitals}
	case "target":
		if c.ability.Target != "enemy" && c.ability.Target != "ally" {
			return []*vitals{&p.fight.vitals}
		}
		if d := l.dummy(c.target, p.state.Continent); d != nil {
			return []*vitals{&d.vitals}
		}
		if o := l.players[c.target]; o != nil {
			return []*vitals{&o.fight.vitals}
		}
		return nil
	}
	center := p.state.At
	if e.Around == "ground" && c.spot != nil {
		center = *c.spot
	} else if e.Around == "target" {
		if at, ok := l.pointOf(c, p); ok {
			center = at
		}
	}
	type reach struct {
		v   *vitals
		gap float64
	}
	var found []reach
	inside := func(at [3]float64) (float64, bool) {
		gap := distance(center, at)
		if e.Radius > 0 && gap > e.Radius {
			return gap, false
		}
		return gap, e.Cone == 0 || withinCone(center, p.state.Yaw, e.Cone, at)
	}
	if e.Affects == "enemies" {
		for _, d := range l.dummies {
			if d.state.Continent != p.state.Continent {
				continue
			}
			if gap, ok := inside(d.state.At); ok {
				found = append(found, reach{&d.vitals, gap})
			}
		}
	} else if e.Affects == "allies" {
		for _, o := range l.players {
			if o.state.Continent != p.state.Continent {
				continue
			}
			if gap, ok := inside(o.state.At); ok {
				found = append(found, reach{&o.fight.vitals, gap})
			}
		}
	}
	slices.SortFunc(found, func(a, b reach) int {
		if a.gap != b.gap {
			if a.gap < b.gap {
				return -1
			}
			return 1
		}
		return int(a.v.ID - b.v.ID)
	})
	if e.Max > 0 && len(found) > e.Max {
		found = found[:e.Max]
	}
	out := make([]*vitals, len(found))
	for i, r := range found {
		out[i] = r.v
	}
	return out
}

func (l *Layer) dummy(id int64, continent string) *dummy {
	for _, d := range l.dummies {
		if d.ID == id && (continent == "" || d.state.Continent == continent) {
			return d
		}
	}
	return nil
}

// tell sends a message to a player and those near it.
func (l *Layer) tell(p *Player, b []byte) {
	p.send(b)
	for _, o := range l.near(p) {
		o.send(b)
	}
}

// stopCast ends what a player's casting.
func (l *Layer) stopCast(p *Player) {
	f := &p.fight
	if f.cast == nil {
		return
	}
	f.cast.stopped = true
	f.cast = nil
	l.tell(p, encode(stopped{"stopped", p.ID()}))
}

// interruptMoving ends a cast its caster has moved during.
func (l *Layer) interruptMoving(p *Player) {
	if c := p.fight.cast; c != nil && !c.ability.CastWhileMoving && movingNow(p.state.Move) {
		l.stopCast(p)
	}
}

// Tick moves combat on: casts let go, what's due lands, resources come back and dummies reset.
func (h *Hub) Tick() {
	h.mu.Lock()
	layers := make([]*Layer, 0, len(h.layers))
	for _, l := range h.layers {
		layers = append(layers, l)
	}
	h.mu.Unlock()
	now := h.now()
	for _, l := range layers {
		l.mu.Lock()
		l.tick(now)
		l.mu.Unlock()
	}
}

func (l *Layer) tick(now time.Time) {
	dt := 0.0
	if !l.lastTick.IsZero() {
		dt = now.Sub(l.lastTick).Seconds()
	}
	l.lastTick = now
	for _, p := range l.players {
		f := &p.fight
		if c := f.cast; c != nil {
			if !c.released && !now.Before(c.release) {
				l.release(p, c, now)
			} else if c.released && !now.Before(c.ends) {
				f.cast = nil
			}
		}
		l.regen(p, dt, now)
	}
	// Landings can add landings, so go by index.
	var later []*landing
	for i := 0; i < len(l.landings); i++ {
		a := l.landings[i]
		if a.cast != nil && a.cast.stopped {
			continue
		}
		if now.Before(a.at) {
			later = append(later, a)
			continue
		}
		a.run(now)
	}
	l.landings = later
	for _, d := range l.dummies {
		if !d.lastHit.IsZero() && now.Sub(d.lastHit) >= dummyResetIdle {
			d.firstHit, d.lastHit, d.damage = time.Time{}, time.Time{}, 0
			d.Health, d.state.Health = d.MaxHealth, d.MaxHealth
			for _, o := range l.players {
				if o.state.Continent == d.state.Continent {
					o.send(encode(healthMessage{"health", d.ID, d.Health, d.MaxHealth}))
				}
			}
		}
		for id := range expire(&d.vitals, now) {
			for _, o := range l.players {
				if o.state.Continent == d.state.Continent {
					o.send(encode(statusGone{"statusGone", d.ID, id}))
				}
			}
		}
	}
	for _, p := range l.players {
		for id := range expire(&p.fight.vitals, now) {
			l.tell(p, encode(statusGone{"statusGone", p.ID(), id}))
		}
	}
}

// expire takes off the statuses that have run out, and returns them.
func expire(v *vitals, now time.Time) map[string]bool {
	gone := map[string]bool{}
	for id, s := range v.Statuses {
		if !now.Before(s.until) {
			delete(v.Statuses, id)
			gone[id] = true
		}
	}
	return gone
}

// regen brings back resources and tells the player how they stand, every so often.
func (l *Layer) regen(p *Player, dt float64, now time.Time) {
	f := &p.fight
	if f.class == nil {
		return
	}
	for _, r := range f.class.Resources {
		was := f.resources[r.Key]
		f.resources[r.Key] = max(0, min(combat.MaxResource(r), was+combat.RegenOf(r)*dt))
		if f.resources[r.Key] != was {
			f.resChanged = true
		}
	}
	if f.resChanged && now.Sub(f.sentAt) >= resourceEvery {
		out := map[string]float64{}
		for k, v := range f.resources {
			out[k] = math.Round(v)
		}
		p.send(encode(resources{"resources", out}))
		f.sentAt, f.resChanged = now, false
	}
}

func movingNow(m Move) bool { return m.Forward != 0 || m.Strafe != 0 || m.Jump }

// live is the times in list still to come.
func live(list []time.Time, now time.Time) []time.Time {
	out := list[:0:0]
	for _, t := range list {
		if t.After(now) {
			out = append(out, t)
		}
	}
	return out
}

func seconds(s float64) time.Duration { return time.Duration(s * float64(time.Second)) }

func distance(a, b [3]float64) float64 {
	return math.Hypot(math.Hypot(a[0]-b[0], a[2]-b[2]), a[1]-b[1])
}

// facing says whether `at` is in the half circle in front of someone at `from` facing `yaw`.
func facing(from [3]float64, yaw float64, at [3]float64) bool {
	return math.Sin(yaw)*(at[0]-from[0])+math.Cos(yaw)*(at[2]-from[2]) >= 0
}

// withinCone says whether `at` is within a cone `degrees` wide, opening from `from` the way `yaw`
// faces.
func withinCone(from [3]float64, yaw, degrees float64, at [3]float64) bool {
	dx, dz := at[0]-from[0], at[2]-from[2]
	length := math.Hypot(dx, dz)
	if length == 0 {
		return true
	}
	cos := (math.Sin(yaw)*dx + math.Cos(yaw)*dz) / length
	return cos >= math.Cos(degrees/2*math.Pi/180)
}
