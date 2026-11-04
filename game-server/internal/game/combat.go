package game

import (
	"bytes"
	"cmp"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"slices"
	"strings"
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
	combatLasts    = 5 * time.Second // you're in combat until this long after you last attacked or were hit
	resourceEvery  = 500 * time.Millisecond
	sparShare      = 0.05 // what a dummy's swing takes of your most health
	refreshKeeps   = 0.3  // the share of a status's duration that a refresh can keep of what was left
)

// vitals are what can be hurt and healed: a player's, or a dummy's.
type vitals struct {
	ID        int64
	Health    float64
	MaxHealth float64
	Statuses  map[statusKey]*activeStatus
	base      combat.Stats // what its class and level give it, before what it holds

	untargetable bool            // as it's last been told
	lookShown    json.RawMessage // what a `transform` shows it as, as it\'s last been told
	absorbShown  float64         // as it\'s last been told
	recent       []taken         // damage it\'s taken lately
	primary      []string        // its class's main stats
}

// statusKey picks out one copy of a status: a unit holds one for each unit that put it on.
type statusKey struct {
	id   string
	from int64
}

// activeStatus is a status on a unit, until it runs out. With no `until`, it stays until removed.
type activeStatus struct {
	def     *combat.Status
	class   string
	since   time.Time // when it was last put on
	until   time.Time
	stacks  int
	uses    int               // what's left of `consumedBy.uses`
	fired   map[int]time.Time // when each of its triggers last fired, by its place in the status
	counts  map[int]float64   // how far along each `every` is, by the same
	granted bool              // what the class gives you for good: a passive, your mastery, a spec's or a talent's
	ticks   map[int]time.Time // when each of its periodic effects next ticks, by its place in the status
	spent   float64           // what the ability that applied it spent
	absorb  float64           // what its `absorb` has left
	stored  float64           // what it holds for `stored` amounts
	zone    *zone             // the area or aura keeping it on, if any
	zones   map[int]*zone     // its own auras, by their place in the status
	owner   *combat.Class     // the class it came from
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
	sparring   bool // a dummy in reach swings back at it
	sparAt     time.Time
	bars       [][]string   // its action bars, as it set them
	ownWeapons bool         // it holds what it picked, not what its class and build give it
	build      combat.Build // its specialization and talents, as allowed
	class      *combat.Class
	level      int
	stats      combat.Stats
	vitals     vitals
	resources  map[string]float64
	pools      map[string]combat.Pool // how each resource behaves, as of the last tick
	sentAt     time.Time
	resChanged bool
	gcdUntil   time.Time
	cooldowns  map[string][]time.Time // when each spent charge of an ability comes back
	lockouts   map[string]time.Time   // when each school it's been locked out of comes back
	controls   []string               // the controls on it, as it's last been told
	cast       *casting
	attacking  int64                // who it's auto-attacking, or 0
	swingAt    time.Time            // when its next swing can start
	swingWhy   string               // why it last couldn't swing, so it says so once
	since      map[string]time.Time // when each thing a `since` condition asks about last happened
}

// casting is a cast or channel under way.
type casting struct {
	ability                *combat.Ability
	target                 int64
	spot                   *[3]float64
	release                time.Time // when a cast lets go
	ends                   time.Time // when it stops: the release, or the channel's end
	channel                bool
	released               bool
	stopped                bool
	spent                  float64       // what its costs came to
	depth                  int           // how many `castAbility`s got it here
	status                 *activeStatus // the status behind what's landing, if it isn't an ability
	lastDone               float64       // what the last effect did
	landed, crit, survived bool          // its last hit: whether there's been one, and how it went
	spentOpen              bool          // those include one that can spend more
	extra                  float64       // how far past its least that one went, as a share
}

// landing is something that happens at a time: a hit arriving, a channel's tick.
type landing struct {
	at   time.Time
	cast *casting // when it stops with a channel
	run  func(now time.Time)
}

// classWithID is the class with that id, or nil.
func classWithID(classes []*combat.Class, id string) *combat.Class {
	for _, class := range classes {
		if class.ID == id {
			return class
		}
	}
	return nil
}

// enterFight gives a player its class's numbers. With no class, it has plain health and no abilities.
func (p *Player) enterFight(class *combat.Class, level int, build combat.Build) {
	f := &p.fight
	f.vitals = vitals{ID: p.state.ID, Statuses: map[statusKey]*activeStatus{}}
	f.resources, f.pools, f.cooldowns, f.lockouts, f.since = map[string]float64{}, map[string]combat.Pool{}, map[string][]time.Time{}, map[string]time.Time{}, map[string]time.Time{}
	if class == nil {
		f.vitals.base = combat.Plain(100)
		f.vitals.MaxHealth, f.vitals.Health = 100, 100
		p.state.Health, p.state.MaxHealth = 100, 100
		return
	}
	f.class = class
	f.level = max(level, 1)
	f.stats = combat.StatsFor(f.class, f.level)
	f.vitals.base, f.vitals.primary = f.stats, f.class.PrimaryStats
	f.vitals.MaxHealth, f.vitals.Health = f.stats.MaxHealth, f.stats.MaxHealth
	for _, r := range f.class.Resources {
		f.resources[r.Key] = combat.StartResource(r)
	}
	f.resChanged = true // so the first tick tells the player where they stand
	f.build = f.class.Allowed(build, f.level)
	f.ownWeapons = holdsOwnWeapon(p.state.Look)
	p.wearGear()
	p.grantStatuses(time.Time{})
	p.state.Class, p.state.Level, p.state.Health, p.state.MaxHealth = f.class.ID, f.level, f.vitals.Health, f.vitals.MaxHealth
}

// grantStatuses puts on what a character's class, level and build give it for good, and says
// nothing: the client works these out too (play/build.js).
func (p *Player) grantStatuses(now time.Time) {
	f := &p.fight
	for _, id := range f.class.HeldFrom(f.level, f.build) {
		key := statusKey{id, p.state.ID}
		if f.vitals.Statuses[key] != nil {
			continue
		}
		if s := f.class.Status(id); s != nil {
			f.vitals.Statuses[key] = &activeStatus{def: s, class: f.class.ID, owner: f.class, since: now, stacks: 1, uses: 1, granted: true}
		} else {
			log.Printf("character %d: class %s holds a status it hasn't got: %s", p.state.ID, f.class.ID, id)
		}
	}
}

// chooseBuild changes a character's specialization and talents, out of combat, and keeps them.
func (l *Layer) chooseBuild(p *Player, b combat.Build) {
	l.mu.Lock()
	defer l.mu.Unlock()
	f := &p.fight
	if l.players[p.ID()] != p || f.class == nil {
		return
	}
	now := l.hub.now()
	if f.inCombat(now) {
		p.send(encode(refused{"refused", "", "you can't change that in combat"}))
		return
	}
	l.applyBuild(p, b, now)
	world, id, spec, talents := l.worldID, p.ID(), f.build.Specialization, f.build.Talents
	go func() {
		if err := l.hub.characters.SaveBuild(context.Background(), world, id, spec, talents); err != nil {
			log.Printf("character %d: couldn't keep its build: %v", id, err)
		}
	}()
}

// applyBuild gives a character as much of a build as its level allows, and the statuses that
// come with it, and tells it.
func (l *Layer) applyBuild(p *Player, b combat.Build, now time.Time) {
	f := &p.fight
	f.build = f.class.Allowed(b, f.level)
	keep := f.class.HeldFrom(f.level, f.build)
	for key, held := range f.vitals.Statuses {
		if held.granted && !slices.Contains(keep, key.id) {
			delete(f.vitals.Statuses, key)
			l.endZones(held)
			l.tellOf(p.ID(), encode(statusGone{"statusGone", p.ID(), key.id, key.from}))
		}
	}
	p.grantStatuses(now)
	for key, held := range f.vitals.Statuses {
		if held.granted {
			l.tellOf(p.ID(), encode(statusOn{"statusOn", p.ID(), shownOf(key, held, now)}))
		}
	}
	p.send(encode(buildMessage{"build", f.build.Specialization, f.build.Talents}))
	if p.wearGear() {
		l.tellOf(p.ID(), encode(gearMessage{"gear", p.ID(), p.state.Look}))
	}
}

// setLevel moves a character to a level, healed up, and keeps it.
func (l *Layer) setLevel(p *Player, level int) {
	f := &p.fight
	now := l.hub.now()
	wanted := f.build
	f.level = level
	f.stats = combat.StatsFor(f.class, level)
	f.vitals.base = f.stats
	p.state.Level = level
	l.tellOf(p.ID(), encode(levelMessage{"level", p.ID(), level}))
	l.applyBuild(p, wanted, now)
	l.refit(&f.vitals, now)
	f.vitals.Health = f.vitals.MaxHealth
	l.sync(&f.vitals)
	l.tellOf(p.ID(), encode(healthMessage{"health", p.ID(), math.Round(f.vitals.Health), f.vitals.MaxHealth}))
	world, id := l.worldID, p.ID()
	go func() {
		if err := l.hub.characters.SaveLevel(context.Background(), world, id, level); err != nil {
			log.Printf("character %d: couldn't keep its level: %v", id, err)
		}
	}()
}

// The most a character's action bars can hold, and the longest an ability id can be.
const (
	maxBars    = 3
	maxSlots   = 12
	maxSlotLen = 64
)

// setBars keeps a character's action bars, if they're the right size. They only say where its
// buttons go, so they don't need to be abilities it knows.
func (l *Layer) setBars(p *Player, bars [][]string) {
	if bars == nil || len(bars) > maxBars || slices.ContainsFunc(bars, func(bar []string) bool {
		return len(bar) > maxSlots || slices.ContainsFunc(bar, func(id string) bool { return len(id) > maxSlotLen })
	}) {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.players[p.ID()] != p {
		return
	}
	p.fight.bars = bars
	world, id := l.worldID, p.ID()
	go func() {
		if err := l.hub.characters.SaveBars(context.Background(), world, id, bars); err != nil {
			log.Printf("character %d: couldn't keep its action bars: %v", id, err)
		}
	}()
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
			vitals: vitals{ID: id, base: combat.Plain(dummyHealth), Health: dummyHealth, MaxHealth: dummyHealth, Statuses: map[statusKey]*activeStatus{}},
			state:  Character{ID: id, Name: "Training Dummy", Look: json.RawMessage(`{"body":"goblin"}`), Continent: d.Continent, At: at, Move: Move{Gait: "run"}, Dummy: true, Health: dummyHealth, MaxHealth: dummyHealth},
		})
	}
}

func (l *Layer) dummiesOn(continent string) []Character {
	out := []Character{}
	for _, d := range l.dummies {
		if d.state.Continent == continent {
			out = append(out, l.seen(d.state))
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
		p.debugLine("%s: refused: %s", m.Ability, why)
		p.send(encode(refused{"refused", m.Ability, why}))
		return
	}
	f := &p.fight
	l.breakStatuses(&f.vitals, "action", func(s *combat.Status) bool { return s.KeptBy.Keeps(ability) })
	gcd := combat.GCDSeconds
	if ability.GCD != nil {
		gcd = *ability.GCD
	}
	if gcd > 0 {
		f.gcdUntil = now.Add(seconds(gcd))
	}
	l.tell(p, encode(used{Type: "used", ID: p.ID(), Class: f.class.ID, Ability: ability.ID, Target: target, Spot: m.Spot, GCD: gcd, CastTime: ability.CastTime, Channel: ability.Channel, Cost: ability.Cost, School: ability.School, Schools: ability.Schools, Animation: ability.Animation}))
	if ability.Range.Melee && ability.Target == "enemy" {
		l.startAttacking(p, target)
	}
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

// inForce is the ability a use of this one comes to: a `modify`'s `becomes` can turn it into another.
func (l *Layer) inForce(p *Player, a *combat.Ability, now time.Time) *combat.Ability {
	f := &p.fight
	for _, m := range l.modifiersOf(&f.vitals, now) {
		if e := m.Effect; e.Becomes != "" && e.Picks(a) && l.holds(&f.vitals, e, nil, now) {
			if to := f.class.Ability(e.Becomes); to != nil {
				return to
			}
		}
	}
	return a
}

const maxCastDepth = 4 // how many abilities can cast each other in a row

// castNow does a `castAbility`: another of the class's abilities, at once.
func (l *Layer) castNow(p *Player, c *casting, e *combat.Effect, on *vitals, now time.Time) {
	f := &p.fight
	if c.depth >= maxCastDepth || f.level < e.Level {
		return
	}
	found := f.class.Ability(e.Ability)
	if found == nil {
		log.Printf("character %d: ability %s casts one its class hasn't got: %s", p.ID(), c.ability.ID, e.Ability)
		return
	}
	a := *l.resolved(p, found, now)
	if e.Strength != 0 && e.Strength != 1 {
		a.Effects = slices.Clone(a.Effects)
		for i := range a.Effects {
			a.Effects[i].Amount = a.Effects[i].Amount.Grown(e.Strength)
		}
	}
	if e.Free {
		a.Cost = nil
	}
	if why := l.affordable(p, &a, on.ID, now); why != "" {
		p.debugLine("%s: %s: %s", c.ability.Name, a.Name, why)
		return
	}
	inner := &casting{ability: &a, target: on.ID, spot: c.spot, depth: c.depth + 1}
	for _, cost := range a.Cost {
		if l.costCounts(p, cost, on.ID, now) {
			spent := spendFor(f, &a, cost)
			f.resources[cost.Resource] -= spent
			f.resChanged = true
			countSpent(f, inner, cost, spent)
		}
	}
	inner.spent = countedSpent(f, inner)
	l.tell(p, encode(used{Type: "used", ID: p.ID(), Class: f.class.ID, Ability: a.ID, Target: on.ID, Spot: c.spot, School: a.School, Schools: a.Schools, Animation: a.Animation}))
	l.landWhich(p, inner, now, func(*combat.Effect) bool { return true })
}

// modifiersOf is the `modify` effects that count for a unit right now.
func (l *Layer) modifiersOf(v *vitals, now time.Time) []combat.Mod {
	// What you gained last goes last, so with several `overrides` it wins. Statuses are held in a
	// map, so ties go by id.
	held := make([]statusKey, 0, len(v.Statuses))
	for key := range v.Statuses {
		held = append(held, key)
	}
	slices.SortFunc(held, func(a, b statusKey) int {
		if n := v.Statuses[a].since.Compare(v.Statuses[b].since); n != 0 {
			return n
		}
		if n := strings.Compare(a.id, b.id); n != 0 {
			return n
		}
		return cmp.Compare(a.from, b.from)
	})
	var mods []combat.Mod
	for _, key := range held {
		each := v.Statuses[key]
		for i := range each.def.Effects {
			if e := &each.def.Effects[i]; e.Type == "modify" && l.holds(v, e, nil, now) {
				mods = append(mods, combat.Mod{Effect: e, Stacks: each.stacks})
			}
		}
	}
	return mods
}

// resolved is an ability as this player would use it now.
func (l *Layer) resolved(p *Player, a *combat.Ability, now time.Time) *combat.Ability {
	f := &p.fight.vitals
	mods := l.modifiersOf(f, now)
	sheet := l.statsOf(f, nil, now)
	for i := range mods {
		mods[i].Mastery = sheet.MasteryPercent()
	}
	if len(mods) > 0 {
		a = p.fight.class.Resolve(a, mods, sheet.MasteryPercent(), l.hub.roll)
	}
	if sheet.Haste() == 0 {
		return a
	}
	hasted := *a
	if a.CooldownHasted {
		hasted.Cooldown = sheet.Hasted(a.Cooldown)
	}
	hasted.CastTime = sheet.Hasted(a.CastTime)
	if a.Channel != nil {
		channel := *a.Channel
		channel.Duration = sheet.Hasted(channel.Duration)
		hasted.Channel = &channel
	}
	gcd := combat.GCDSeconds
	if a.GCD != nil {
		gcd = *a.GCD
	}
	if gcd > 0 && (a.GCDHasted == nil || *a.GCDHasted) {
		gcd = max(sheet.Hasted(gcd), combat.LowestGCD)
		hasted.GCD = &gcd
	}
	return &hasted
}

// check says whether a player can use an ability now: the ability and its target, or why not.
func (l *Layer) check(p *Player, m incoming, now time.Time) (*combat.Ability, int64, string) {
	f := &p.fight
	if f.class == nil {
		return nil, 0, "you have no class"
	}
	ability := f.class.Ability(m.Ability)
	if ability == nil || !f.class.Knows(ability, f.level, f.build) {
		return nil, 0, "you don't know that"
	}
	ability = l.resolved(p, l.inForce(p, ability, now), now)
	if f.cast != nil && !ability.WhileCasting {
		return nil, 0, "you're busy"
	}
	gcd := combat.GCDSeconds
	if ability.GCD != nil {
		gcd = *ability.GCD
	}
	if gcd > 0 && now.Before(f.gcdUntil) {
		return nil, 0, "not ready yet"
	}
	if !slices.Contains(ability.Ignores, "cooldown") && len(live(f.cooldowns[ability.ID], now)) >= max(ability.Charges, 1) {
		return nil, 0, "not ready yet"
	}
	if why := combat.Blocked(l.controlsOn(&f.vitals), ability); why != "" {
		return nil, 0, why
	}
	if lockedOut(f, ability, now) {
		return nil, 0, "that school is locked out"
	}
	if why := l.affordable(p, ability, m.Target, now); why != "" {
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
		if l.untargetable(&d.vitals, now) {
			return nil, 0, "you can't target that"
		}
		target, at = d.ID, d.state.At
	case "ally", "any":
		if d := l.dummy(m.Target, p.state.Continent); d != nil && ability.Target == "any" {
			if l.untargetable(&d.vitals, now) {
				return nil, 0, "you can't target that"
			}
			target, at = d.ID, d.state.At
			break
		}
		o := l.players[m.Target]
		if o == nil || o.state.Continent != p.state.Continent {
			o = p // with no one else targeted, it goes on you
		}
		if o != p && l.untargetable(&o.fight.vitals, now) {
			return nil, 0, "you can't target that"
		}
		target, at = o.ID(), o.state.At
	case "ground":
		if m.Spot == nil || !finite(*m.Spot, 0, 0) {
			return nil, 0, "you need to pick a spot"
		}
		at = *m.Spot
	default:
		if why := l.unmet(p, ability, 0, now); why != "" {
			return nil, 0, why
		}
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
	if target != p.ID() && !l.sees(p.state.Continent, p.state.At, at) {
		return nil, 0, cantSee
	}
	if why := l.unmet(p, ability, target, now); why != "" {
		return nil, 0, why
	}
	return ability, target, ""
}

// cantSee is why you can't use something on what's out of your sight.
const cantSee = "you can't see that"

// sees is whether someone with their feet at from can see what has its feet at to. With no ground
// to go by, or trouble reading it, nothing's in the way.
func (l *Layer) sees(continent string, from, to [3]float64) bool {
	g := l.ground(continent)
	if g == nil {
		return true
	}
	clear, err := g.Sees(from, to)
	if err != nil {
		log.Printf("line of sight on %s: %v", continent, err)
		return true
	}
	return clear
}

// feetOf is where a unit's feet are, if it's here.
func (l *Layer) feetOf(id int64) ([3]float64, bool) {
	if d := l.dummy(id, ""); d != nil {
		return d.state.At, true
	}
	if o := l.players[id]; o != nil {
		return o.state.At, true
	}
	return [3]float64{}, false
}

// seesCast is whether the caster can still see what a cast is on.
func (l *Layer) seesCast(p *Player, c *casting) bool {
	if c.spot != nil {
		return l.sees(p.state.Continent, p.state.At, *c.spot)
	}
	if c.target == 0 || c.target == p.ID() {
		return true
	}
	at, here := l.feetOf(c.target)
	return !here || l.sees(p.state.Continent, p.state.At, at)
}

// answerSees tells the player whether the server has them seeing a unit, for the line of sight
// overlay, as often as maxSeesPerSecond.
func (l *Layer) answerSees(p *Player, target int64) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.hub.now()
	if now.Sub(p.seesFrom) >= time.Second {
		p.seesFrom, p.seesAsked = now, 0
	}
	at, here := l.feetOf(target)
	if !here || p.seesAsked >= maxSeesPerSecond || distance(p.state.At, at) > seesReachFt {
		return
	}
	p.seesAsked++
	p.send(encode(seesAnswer{"sees", target, l.sees(p.state.Continent, p.state.At, at)}))
}

const (
	maxSeesPerSecond = 40
	seesReachFt      = 200.0
)

func needsFacing(a *combat.Ability) bool {
	if a.Facing != nil {
		return *a.Facing
	}
	return a.Target == "enemy"
}

// affordable says what the ability needs that the fighter hasn't got.
func (l *Layer) affordable(p *Player, a *combat.Ability, target int64, now time.Time) string {
	f := &p.fight
	for _, cost := range a.Cost {
		if l.costCounts(p, cost, target, now) && f.resources[cost.Resource] < costOf(f, cost) {
			return "not enough " + cost.Resource
		}
	}
	return ""
}

// costCounts says whether a cost's conditions hold.
func (l *Layer) costCounts(p *Player, cost combat.Cost, target int64, now time.Time) bool {
	if len(cost.When) == 0 {
		return true
	}
	_, ok := combat.All(cost.When, l.facts(p, target, now))
	return ok
}

// spendFor is what a use takes of a cost, which can be more than the least it needs.
func spendFor(f *fighter, a *combat.Ability, cost combat.Cost) float64 {
	least, have := costOf(f, cost), f.resources[cost.Resource]
	switch {
	case cost.All:
		return have
	case cost.UpTo > 0 || a.SpendsUpTo > 0:
		return max(least, min(have, max(cost.UpTo, least)+a.SpendsUpTo))
	}
	return least
}

// countSpent notes how many points a use spent, for what goes by that, and how far past the least
// its open-ended cost went, as a share.
func countSpent(f *fighter, c *casting, cost combat.Cost, spent float64) {
	a := c.ability
	open := cost.All || cost.UpTo > 0 || a.SpendsUpTo > 0
	if open && !c.spentOpen {
		c.spent, c.spentOpen = 0, true
	}
	if open || !c.spentOpen {
		c.spent += spent
	}
	if !open {
		return
	}
	least := costOf(f, cost)
	top := max(cost.UpTo, least) + a.SpendsUpTo
	if top > least {
		c.extra = min((spent-least)/(top-least), 1)
	}
}

// countedSpent is what a use counts as having spent, after what a `modify` says.
func countedSpent(f *fighter, c *casting) float64 {
	a := c.ability
	if a.SpentAsMax {
		most := 0.0
		for _, r := range f.class.Resources {
			for _, cost := range a.Cost {
				if cost.Resource == r.Key {
					most = max(most, f.pool(r).Max)
				}
			}
		}
		return most
	}
	if a.SpentAs != 0 {
		return a.SpentAs
	}
	return c.spent
}

// amountOf is what an effect's amount comes to in this use, with what it spent.
func amountOf(c *casting, e *combat.Effect, count int) combat.Amount {
	out := e.AmountFor(count).Spending(c.spent)
	by := e.ByExtraSpent
	if c.ability.ByExtraSpent != 0 {
		by = c.ability.ByExtraSpent
	}
	if by != 0 && c.extra > 0 {
		out = out.Grown(1 + (by-1)*c.extra)
	}
	return out
}

// chanceHolds rolls an effect's `chance`, if it has one.
func (l *Layer) chanceHolds(c *casting, e *combat.Effect) bool {
	if e.Chance == nil && e.ChancePerSpent == 0 {
		return true
	}
	chance := 1.0
	if e.Chance != nil {
		chance = *e.Chance
	}
	return l.hub.roll() < chance+e.ChancePerSpent*c.spent
}

// payForTick takes what a channel costs each tick, and says whether it could.
func (l *Layer) payForTick(p *Player, c *casting, ticks int) bool {
	f, a := &p.fight, c.ability
	type due struct {
		resource string
		amount   float64
	}
	var owed []due
	for _, cost := range a.Cost {
		if cost.PerSecond > 0 {
			owed = append(owed, due{cost.Resource, cost.PerSecond * a.Channel.Duration / float64(ticks)})
		}
	}
	if each := a.Channel.CostPerTick; each != nil {
		owed = append(owed, due{each.Resource, each.Amount})
	}
	for _, each := range owed {
		if f.resources[each.resource] < each.amount {
			p.send(encode(refused{"refused", a.ID, "not enough " + each.resource}))
			return false
		}
	}
	for _, each := range owed {
		f.resources[each.resource] -= each.amount
		f.resChanged = true
	}
	return true
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

// castOf is an ability being used, as what's watching sees it.
func castOf(a *combat.Ability) *combat.HitContext {
	return &combat.HitContext{Schools: schoolsOf("", nil, a), Ability: a, Kinds: []string{"ability"}}
}

// release lets go of a cast: it spends what the ability costs, starts its cooldown, and sets off
// what lands.
func (l *Layer) release(p *Player, c *casting, now time.Time) {
	f := &p.fight
	a := c.ability
	c.released = true
	why := l.affordable(p, a, c.target, now)
	if why == "" && !c.channel && a.Target != "self" && !l.seesCast(p, c) {
		why = cantSee
	}
	if why != "" {
		if f.cast == c {
			f.cast = nil
		}
		p.send(encode(refused{"refused", a.ID, why}))
		l.tell(p, encode(stopped{"stopped", p.ID()}))
		return
	}
	for _, cost := range a.Cost {
		if !l.costCounts(p, cost, c.target, now) {
			continue
		}
		spent := spendFor(f, a, cost)
		if spent == 0 {
			continue
		}
		f.resources[cost.Resource] -= spent
		f.resChanged = true
		countSpent(f, c, cost, spent)
		p.debugLine("%s: spent %g %s", a.Name, spent, cost.Resource)
		l.fire(event{on: "spend", who: &f.vitals, other: c.target, ctx: castOf(a), amount: spent, resource: cost.Resource}, now)
	}
	c.spent = countedSpent(f, c)
	l.fire(event{on: "cast", who: &f.vitals, other: c.target, ctx: castOf(a)}, now)
	if a.Cooldown > 0 {
		spent := live(f.cooldowns[a.ID], now)
		from := now
		if len(spent) > 0 {
			from = spent[len(spent)-1]
		}
		f.cooldowns[a.ID] = append(spent, from.Add(seconds(a.Cooldown)))
		p.send(encode(cooldown{"cooldown", a.ID, readyIn(f, a, now)}))
	}
	used := usedBy(f, a)
	if c.channel {
		l.spend(p, used, now)
		f.cast = c
		ticks := max(a.Channel.Ticks, 1)
		for n := 1; n <= ticks; n++ {
			at := now.Add(seconds(a.Channel.Duration * float64(n) / float64(ticks)))
			l.after(at, c, func(now time.Time) {
				if !l.payForTick(p, c, ticks) {
					l.stopCast(p)
					return
				}
				l.landAll(p, c, now, false)
			})
		}
		l.after(now.Add(seconds(a.Channel.Duration)), c, func(now time.Time) {
			l.fire(event{on: "channelEnd", who: &f.vitals, other: c.target, ctx: castOf(a)}, now)
		})
		return
	}
	if f.cast == c {
		f.cast = nil
	}
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
	l.after(strike, nil, func(now time.Time) { l.spend(p, used, now) })
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
	l.landWhich(p, c, now, func(e *combat.Effect) bool { return !leaveFlying || !arrives(c.ability, e) })
}

func (l *Layer) landArriving(p *Player, c *casting, now time.Time) {
	l.landWhich(p, c, now, func(e *combat.Effect) bool { return arrives(c.ability, e) })
}

// landWhich lands the effects `which` picks. It reads all their conditions first, so one effect
// can't change whether another lands: one button can start a status or end it.
func (l *Layer) landWhich(p *Player, c *casting, now time.Time, which func(*combat.Effect) bool) {
	if l.players[p.ID()] != p {
		return
	}
	type landingOn struct {
		effect *combat.Effect
		on     *vitals
		count  int // how many it reached
	}
	var plan []landingOn
	for i := range c.ability.Effects {
		e := &c.ability.Effects[i]
		if !which(e) {
			continue
		}
		var reached []*vitals
		if e.Type != "area" {
			reached = l.reached(p, c, e)
			if len(reached) == 0 {
				p.debugLine("%s: %s reached no one", c.ability.Name, e.Type)
			}
		}
		if e.Type == "area" {
			if failed, ok := combat.All(e.When, l.facts(p, c.target, now)); ok {
				l.placeArea(p, c, e, now)
			} else {
				p.debugLine("%s: area skipped: %s", c.ability.Name, failed.Why(statusNames(p)))
			}
			continue
		}
		for _, on := range reached {
			target := c.target
			if e.Affects == "enemies" || e.Affects == "allies" {
				target = on.ID // an area's conditions ask about each one it reaches
			}
			if failed, ok := combat.All(e.When, l.factsInUse(p, c, target, len(reached), now)); !ok {
				p.debugLine("%s: %s skipped: %s", c.ability.Name, e.Type, failed.Why(statusNames(p)))
				continue
			}
			plan = append(plan, landingOn{e, on, len(reached)})
		}
	}
	for _, each := range plan {
		// How a hit went is only known once it's landed, so what asks about that waits till now.
		if slices.ContainsFunc(each.effect.When, func(w combat.Condition) bool { return w.Outcome != "" }) {
			if _, ok := combat.All(each.effect.When, l.factsInUse(p, c, each.on.ID, each.count, now)); !ok {
				continue
			}
		}
		l.land(p, c, each.effect, each.on, each.count, now)
	}
}

// statusNames gives a status's name by id, for what a player reads.
func statusNames(p *Player) func(string) string {
	return func(id string) string {
		if s := p.fight.class.Status(id); s != nil {
			return s.Name
		}
		return id
	}
}

// unmet says why a player can't use an ability on a target, going by its `requires`.
func (l *Layer) unmet(p *Player, a *combat.Ability, target int64, now time.Time) string {
	if slices.Contains(a.Ignores, "requires") {
		return ""
	}
	if failed, ok := combat.All(a.Requires, l.facts(p, target, now)); !ok {
		return failed.Why(statusNames(p))
	}
	return ""
}

// factsInUse is what an ability's effects are read against, with how the use is going.
func (l *Layer) factsInUse(p *Player, c *casting, target int64, hits int, now time.Time) *combat.Facts {
	out := l.facts(p, target, now)
	out.Used = &combat.UseSoFar{Spent: c.spent, Hits: hits, Crit: c.crit, Survived: c.survived, Landed: c.landed}
	return out
}

// facts is what conditions are read against, for a player and its target.
func (l *Layer) facts(p *Player, target int64, now time.Time) *combat.Facts {
	f := &p.fight
	out := &combat.Facts{
		Self:      unitOf(&f.vitals, p.ID(), l.fighterState(p, now)),
		Since:     map[string]float64{},
		Resources: map[string]combat.ResourceAmount{},
	}
	for what, at := range f.since {
		out.Since[what] = now.Sub(at).Seconds()
	}
	out.Holders, out.InAreas = map[string]int{}, map[string]bool{}
	out.Groups = groupsOn(&f.vitals)
	l.eachUnit(func(v *vitals, _ [3]float64, _ string) {
		for key := range v.Statuses {
			if key.from == p.ID() {
				out.Holders[key.id]++
			}
		}
	})
	for _, z := range l.zones {
		if z.from == p && z.inside[target] != nil {
			out.InAreas[z.kind] = true
		}
	}
	if t := l.unitWithID(target, p.state.Continent); t != nil {
		out.TargetGroups = groupsOn(t)
	}
	if f.class != nil {
		for _, r := range f.class.Resources {
			out.Resources[r.Key] = combat.ResourceAmount{Have: f.resources[r.Key], Max: f.pool(r).Max}
		}
	}
	if d := l.dummy(target, p.state.Continent); d != nil {
		state := []string{}
		if !d.lastHit.IsZero() && now.Sub(d.lastHit) < combatLasts {
			state = append(state, "inCombat")
		}
		unit := unitOf(&d.vitals, p.ID(), state)
		out.Target, out.TargetIs = &unit, []string{"enemy", "other", "nonPlayer"}
		out.Position = positionOf(p.state.At, d.state.At, d.state.Yaw)
	} else if o := l.players[target]; o != nil && target != 0 {
		unit := unitOf(&o.fight.vitals, p.ID(), l.fighterState(o, now))
		out.Target, out.TargetIs = &unit, []string{"ally", "player"}
		if o == p {
			out.TargetIs = append(out.TargetIs, "self")
		} else {
			out.TargetIs = append(out.TargetIs, "other")
		}
		out.Position = positionOf(p.state.At, o.state.At, o.state.Yaw)
	}
	return out
}

// unitOf is a unit as one reader's conditions see it: its statuses are the ones that reader put on.
func unitOf(v *vitals, reader int64, state []string) combat.Unit {
	stacks := map[string]int{}
	for key, s := range v.Statuses {
		if key.from == reader {
			stacks[key.id] = s.stacks
		}
	}
	return combat.Unit{Health: v.Health, MaxHealth: v.MaxHealth, Statuses: stacks, State: state}
}

// lookOn is the look a unit's holding a `transform` gives it, the latest put on, or nil for its own.
func lookOn(v *vitals) json.RawMessage {
	var look json.RawMessage
	var since time.Time
	for _, held := range v.Statuses {
		for i := range held.def.Effects {
			if e := &held.def.Effects[i]; e.Type == "transform" && !held.since.Before(since) {
				if unit := held.unit(e.Into); unit != nil {
					look, since = unit.Look, held.since
				}
			}
		}
	}
	return look
}

// unit is a unit of the class this status came from.
func (a *activeStatus) unit(id string) *combat.ClassUnit {
	if a.owner == nil {
		return nil
	}
	for i := range a.owner.Units {
		if a.owner.Units[i].ID == id {
			return &a.owner.Units[i]
		}
	}
	return nil
}

// groupsOn is the status groups a unit holds something of.
func groupsOn(v *vitals) map[string]bool {
	out := map[string]bool{}
	for _, held := range v.Statuses {
		if held.def.Group != "" {
			out[held.def.Group] = true
		}
	}
	return out
}

// fighterState is which of a `state` condition's words are true of a player. Everywhere counts as
// outdoors.
func (l *Layer) fighterState(p *Player, now time.Time) []string {
	state := []string{"outdoors"}
	controls := l.controlsOn(&p.fight.vitals)
	if combat.Helpless(controls) {
		state = append(state, "controlled")
	}
	if slices.Contains(controls, "stun") {
		state = append(state, "stunned")
	}
	if p.motion.slowed < 0 {
		state = append(state, "slowed")
	}
	if p.fight.cast != nil {
		state = append(state, "casting")
	}
	if p.motion.aloft {
		state = append(state, "airborne", "falling")
	}
	if p.fight.inCombat(now) {
		state = append(state, "inCombat")
	}
	return state
}

func (f *fighter) inCombat(now time.Time) bool {
	for _, what := range []string{"attack", "damageTaken"} {
		if at, ok := f.since[what]; ok && now.Sub(at) < combatLasts {
			return true
		}
	}
	return false
}

// attacked notes that a player attacked someone, which keeps it in combat.
func (f *fighter) attacked(now time.Time) {
	if !f.inCombat(now) {
		f.since["combatStart"] = now
	}
	f.since["attack"] = now
}

// positionOf says whether someone at `from` is behind or in front of a unit at `at` facing `yaw`.
func positionOf(from, at [3]float64, yaw float64) string {
	if facing(at, yaw, from) {
		return "inFront"
	}
	return "behind"
}

// land does one effect to one unit. Effects that aren't here yet do nothing.
func (l *Layer) land(p *Player, c *casting, e *combat.Effect, on *vitals, count int, now time.Time) {
	if !l.chanceHolds(c, e) {
		return
	}
	h := hit{Type: "hit", From: p.ID(), Ability: c.ability.ID, On: on.ID, Effect: e.Type}
	switch e.Type {
	case "damage":
		ctx := hitOf(c, e, on, count)
		l.critRules(p, e, on, &ctx, now)
		l.strike(p, on, l.amountFor(p, c, e, on, count, now), ctx, &h, now)
		if !h.Missed {
			c.landed, c.crit, c.survived = true, h.Crit, on.Health > 0
			l.drain(p, h.Amount, e.Drain, c.ability.ID)
			c.lastDone = h.Amount
			if center, continent, ok := l.unitAt(on.ID, [3]float64{}, ""); ok {
				defer l.spill(p, c, e, on, center, continent, h.Amount, count, now)
			}
		}
	case "consume":
		if e.Affects != "summons" {
			l.consume(p, c, e, on, now)
			return
		}
		p.debugLine("%s: consume of summons does nothing yet", c.ability.Name)
		return
	case "extend":
		l.extend(p, c, e, on, now)
		return
	case "cooldown":
		l.changeCooldowns(p, c, e, now)
		return
	case "dispel":
		l.dispel(p, c, e, on, now)
		return
	case "castAbility":
		l.castNow(p, c, e, on, now)
		return
	case "move":
		l.forceMove(p, c, e, on, now)
		return
	case "interrupt":
		if !l.interrupt(p, e, on, &h, now) {
			p.debugLine("%s: %s isn't casting", c.ability.Name, l.nameOf(on.ID))
			return
		}
	case "heal":
		healing := hitOf(c, e, on, count)
		l.critRules(p, e, on, &healing, now)
		n, crit := l.rollHeal(p, on, l.amountFor(p, c, e, on, count, now), healing, now)
		c.lastDone = n
		over := max(on.Health+n-on.MaxHealth, 0)
		on.Health = min(on.Health+n, on.MaxHealth)
		h.Amount, h.Crit = math.Round(n), crit
		ctx := hitOf(c, e, on, count)
		defer l.healedBy(p, on, n, over, ctx, now)
	case "resource":
		n, _ := combat.Roll(l.amountFor(p, c, e, on, count, now), l.statsOf(&p.fight.vitals, nil, now), false, l.hub.roll)
		if given, ok := l.addResource(&p.fight, e.Resource, n); ok {
			h.Amount, h.Resource = math.Round(given), e.Resource
		}
	case "status":
		duration := e.Duration
		if e.DurationPerSpent != 0 {
			if duration == 0 {
				if s := p.fight.class.Status(e.Status); s != nil {
					duration = s.Duration
				}
			}
			duration += e.DurationPerSpent * c.spent
		}
		if !l.applyStatus(p, c.ability, e.Status, duration, on, &h, now) {
			return
		}
		if held := on.Statuses[statusKey{e.Status, p.ID()}]; held != nil {
			held.spent = c.spent
			var given *combat.Amount
			if e.Amount != (combat.Amount{}) {
				worked := l.amountFor(p, c, e, on, count, now)
				given = &worked
			}
			l.startAbsorb(p, held, given, on, now)
		}
	default:
		p.debugLine("%s: %s does nothing yet", c.ability.Name, e.Type)
		return
	}
	p.debugLine("%s", l.debugHit(p, c.ability.Name, e, on, h))
	h.Health, h.MaxHealth = math.Round(on.Health), on.MaxHealth
	l.sync(on)
	l.tell(p, encode(h))
}

// dispel takes statuses off a unit by kind, control or tag, up to `count`, oldest first. It takes
// what harms a friend, and what helps an enemy.
func (l *Layer) dispel(p *Player, c *casting, e *combat.Effect, on *vitals, now time.Time) {
	keeps := "buff"
	if on.ID < 0 { // only dummies are enemies so far
		keeps = "debuff"
	}
	var found []statusKey
	for key, held := range on.Statuses {
		if held.def.Kind != keeps && held.def.Dispelled(e) {
			found = append(found, key)
		}
	}
	slices.SortFunc(found, func(a, b statusKey) int {
		return cmp.Or(on.Statuses[a].since.Compare(on.Statuses[b].since), cmp.Compare(a.id, b.id), cmp.Compare(a.from, b.from))
	})
	if len(found) == 0 {
		p.debugLine("%s: %s has nothing it removes", c.ability.Name, l.nameOf(on.ID))
	}
	for _, key := range found[:min(max(e.Count, 1), len(found))] {
		held := on.Statuses[key]
		if held == nil {
			continue // something ending just now took this one with it
		}
		l.fire(event{on: "dispel", who: &p.fight.vitals, other: on.ID, ctx: castOf(c.ability), status: key.id, stacks: held.stacks}, now)
		l.fire(statusEvent("dispelled", on, key, held), now)
		if on.Statuses[key] != held {
			continue
		}
		l.takeOff(on, key)
		p.debugLine("%s: took %s off %s", c.ability.Name, key.id, l.nameOf(on.ID))
		l.tell(p, encode(hit{Type: "hit", From: p.ID(), Ability: c.ability.ID, On: on.ID, Effect: e.Type, Removed: key.id, Class: held.class, Health: math.Round(on.Health), MaxHealth: on.MaxHealth}))
	}
}

// interrupt stops a player's cast and locks it out of the cast's school. It says whether there was one.
func (l *Layer) interrupt(p *Player, e *combat.Effect, on *vitals, h *hit, now time.Time) bool {
	o := l.players[on.ID]
	if o == nil || o.fight.cast == nil {
		return false
	}
	if l.immuneTo(on, "interrupt", now) {
		h.Missed, h.Avoided = true, "immune"
		return true
	}
	f := &o.fight
	stopped := f.cast.ability
	l.stopCast(o)
	for _, school := range schoolsOf("", nil, stopped) {
		if e.Lockout > 0 {
			f.lockouts[school] = now.Add(seconds(e.Lockout))
			o.send(encode(lockout{"lockout", school, e.Lockout}))
		}
	}
	h.Stopped, h.Class = stopped.ID, f.class.ID
	l.fire(event{on: "interrupt", who: &p.fight.vitals, other: on.ID, ctx: castOf(stopped)}, now)
	return true
}

func lockedOut(f *fighter, a *combat.Ability, now time.Time) bool {
	return slices.ContainsFunc(schoolsOf("", nil, a), func(school string) bool { return f.lockouts[school].After(now) })
}

// changeCooldowns does a `cooldown` effect, on the caster's own cooldowns, and tells it where they stand.
func (l *Layer) changeCooldowns(p *Player, c *casting, e *combat.Effect, now time.Time) {
	f := &p.fight
	for i := range f.class.Abilities {
		a := &f.class.Abilities[i]
		if !slices.Contains(e.Abilities, a.ID) && (e.Tag == "" || !slices.Contains(a.Tags, e.Tag)) {
			continue
		}
		spent := live(f.cooldowns[a.ID], now)
		if len(spent) == 0 {
			continue
		}
		f.cooldowns[a.ID] = sooner(spent, e, now)
		left := readyIn(f, l.resolved(p, a, now), now)
		p.debugLine("%s: %s is ready in %.1f s", c.ability.Name, a.Name, left)
		p.send(encode(cooldown{"cooldown", a.ID, left}))
	}
}

// sooner is an ability's spent charges after a `cooldown` effect. They come back one after another,
// so taking time off moves them all, and giving a charge back drops the last to come.
func sooner(spent []time.Time, e *combat.Effect, now time.Time) []time.Time {
	if e.Reset {
		return nil
	}
	moved := make([]time.Time, len(spent))
	for i, t := range spent {
		moved[i] = t.Add(-seconds(e.By))
	}
	moved = live(moved, now)
	return moved[:max(len(moved)-e.Charges, 0)]
}

// readyIn is how many seconds until an ability can be used, as far as its cooldown goes.
func readyIn(f *fighter, a *combat.Ability, now time.Time) float64 {
	spent := live(f.cooldowns[a.ID], now)
	charges := max(a.Charges, 1)
	if len(spent) < charges {
		return 0
	}
	return spent[len(spent)-charges].Sub(now).Seconds()
}

// applyStatus puts a status on a unit and notes it in the hit. It says whether the class has that status.
func (l *Layer) applyStatus(p *Player, a *combat.Ability, id string, duration float64, on *vitals, h *hit, now time.Time) bool {
	f := &p.fight
	s := f.class.Status(id)
	if s == nil {
		log.Printf("character %d: ability %s applies a status its class hasn't got: %s", p.ID(), a.ID, id)
		return false
	}
	mods := l.modifiersOf(&f.vitals, now)
	mastery := 0.0
	if len(mods) > 0 {
		mastery = l.statsOf(&f.vitals, nil, now).MasteryPercent()
	}
	s = f.class.ResolveStatus(s, duration, mods, mastery)
	if l.immuneToStatus(on, s, p.ID(), now) {
		h.Missed, h.Avoided = true, "immune"
		return true
	}
	lasts := s.Duration
	key := statusKey{s.ID, p.ID()}
	was := on.Statuses[key]
	if s.Group != "" {
		for other, each := range on.Statuses {
			if other != key && each.def.Group == s.Group {
				l.takeOff(on, other)
			}
		}
	}
	if s.Limit > 0 && was == nil {
		l.makeRoom(p, s)
	}
	held := &activeStatus{def: s, class: f.class.ID, owner: f.class, since: now, stacks: 1, uses: 1}
	if s.ConsumedBy != nil && s.ConsumedBy.Uses > 0 {
		held.uses = s.ConsumedBy.Uses
	}
	if was != nil {
		switch s.Stacking {
		case "stack":
			held.stacks = was.stacks + 1
			if s.MaxStacks > 0 {
				held.stacks = min(held.stacks, s.MaxStacks)
			}
		case "refresh":
			if lasts > 0 && !was.until.IsZero() {
				lasts += min(max(was.until.Sub(now).Seconds(), 0), lasts*refreshKeeps)
			}
		}
	}
	if lasts > 0 {
		held.until = now.Add(seconds(lasts))
	}
	if was != nil {
		held.ticks, held.fired, held.counts, held.zones = was.ticks, was.fired, was.counts, was.zones // putting it on again doesn't start these over
	}
	on.Statuses[key] = held
	l.tellOf(on.ID, encode(statusOn{"statusOn", on.ID, shownOf(key, held, now)}))
	l.fire(statusEvent("statusGained", on, key, held), now)
	h.Status, h.Lasts, h.Class, h.Stacks = s.ID, lasts, f.class.ID, held.stacks
	return true
}

// makeRoom takes a status off the oldest units holding it from a player, so one more stays within its limit.
func (l *Layer) makeRoom(p *Player, s *combat.Status) {
	key := statusKey{s.ID, p.ID()}
	var holders []*vitals
	l.eachUnit(func(v *vitals, _ [3]float64, _ string) {
		if v.Statuses[key] != nil {
			holders = append(holders, v)
		}
	})
	slices.SortFunc(holders, func(a, b *vitals) int { return a.Statuses[key].since.Compare(b.Statuses[key].since) })
	for i := 0; i <= len(holders)-s.Limit; i++ {
		l.takeOff(holders[i], key)
	}
}

// eachUnit goes over every unit on the layer that can hold a status.
func (l *Layer) eachUnit(do func(v *vitals, at [3]float64, continent string)) {
	for _, d := range l.dummies {
		do(&d.vitals, d.state.At, d.state.Continent)
	}
	for _, o := range l.players {
		do(&o.fight.vitals, o.state.At, o.state.Continent)
	}
}

// takeOff removes a status from a unit and says so.
func (l *Layer) takeOff(on *vitals, key statusKey) {
	held := on.Statuses[key]
	delete(on.Statuses, key)
	if held != nil {
		l.endZones(held)
		l.fire(statusEvent("statusEnds", on, key, held), l.hub.now())
	}
	l.tellOf(on.ID, encode(statusGone{"statusGone", on.ID, key.id, key.from}))
}

// dropFrom takes off everything a unit put on, when it leaves: nothing's left to carry it on or end it.
func (l *Layer) dropFrom(from int64) {
	l.eachUnit(func(v *vitals, _ [3]float64, _ string) {
		for key := range v.Statuses {
			if key.from == from {
				l.takeOff(v, key)
			}
		}
	})
}

// breakStatuses takes off a unit's statuses that end when this happens. Only an ability has anything to keep them on.
func (l *Layer) breakStatuses(on *vitals, what string, kept func(*combat.Status) bool) {
	for key, each := range on.Statuses {
		if (slices.Contains(each.def.BreaksOn, what) || (what == "damage" && each.def.BreaksOnDamage())) && (kept == nil || !kept(each.def)) {
			l.takeOff(on, key)
		}
	}
}

// usingUp is a status that an ability's use will spend once its effects have landed.
type usingUp struct {
	key  statusKey
	held *activeStatus
}

// usedBy finds the statuses that using an ability spends.
func usedBy(f *fighter, a *combat.Ability) []usingUp {
	var out []usingUp
	for key, each := range f.vitals.Statuses {
		if each.def.ConsumedBy.Matches(a) {
			out = append(out, usingUp{key, each})
		}
	}
	return out
}

// spend takes a use or stacks from statuses an ability used, unless they've been put on afresh since.
func (l *Layer) spend(p *Player, used []usingUp, now time.Time) {
	if l.players[p.ID()] != p {
		return
	}
	on := &p.fight.vitals
	for _, u := range used {
		if on.Statuses[u.key] != u.held {
			continue
		}
		l.fire(statusEvent("statusConsumed", on, u.key, u.held), now)
		if n := u.held.def.ConsumedBy.Stacks; n > 0 {
			u.held.stacks -= n
			if u.held.stacks > 0 {
				l.statusChanged(on.ID, u.key, u.held, now)
				continue
			}
		} else if u.held.uses--; u.held.uses > 0 {
			continue
		}
		l.takeOff(on, u.key)
		p.debugLine("%s is used up", u.held.def.Name)
	}
}

// sweep takes off statuses that have run out or whose holder has gone too far from who put them
// on, and refits each unit to what it holds now.
func (l *Layer) sweep(now time.Time) {
	l.eachUnit(func(v *vitals, at [3]float64, continent string) {
		for key, each := range v.Statuses {
			l.tickStatus(v, key, each, at, continent, now)
			if v.Statuses[key] != each {
				continue
			}
			over := !each.until.IsZero() && !now.Before(each.until)
			if each.def.Leash > 0 && !over {
				from := l.players[key.from]
				over = from == nil || from.state.Continent != continent || distance(from.state.At, at) > each.def.Leash
			}
			if over {
				l.takeOff(v, key)
			}
		}
		l.refit(v, now)
	})
	l.sweepZones(now)
}

// tickStatus lands whatever's due of a status's periodic effects. A last tick due as it ends still lands.
func (l *Layer) tickStatus(v *vitals, key statusKey, held *activeStatus, at [3]float64, continent string, now time.Time) {
	p := l.players[key.from]
	if p == nil {
		return
	}
	for i := range held.def.Effects {
		e := &held.def.Effects[i]
		if e.Type != "periodic" || held.def.Period(e) <= 0 {
			continue
		}
		period := l.statsOf(&p.fight.vitals, nil, now).Hasted(held.def.Period(e))
		if held.ticks == nil {
			held.ticks = map[int]time.Time{}
		}
		next, ok := held.ticks[i]
		if !ok {
			next = held.since.Add(seconds(period))
		}
		for !now.Before(next) && (held.until.IsZero() || !next.After(held.until)) && v.Statuses[key] == held {
			l.tickOf(p, v, key.id, held, e, at, continent, now)
			next = next.Add(seconds(period))
		}
		held.ticks[i] = next
	}
}

// tickOf lands one tick of a periodic effect, from the one who applied it. Ticks don't miss.
func (l *Layer) tickOf(p *Player, holder *vitals, id string, held *activeStatus, e *combat.StatusEffect, at [3]float64, continent string, now time.Time) {
	targets := []*vitals{holder}
	if e.Affects == "enemies" || e.Affects == "allies" {
		targets = l.around(e, at, continent)
	}
	amount := combat.Shared(e.Amount.Spending(held.spent), e.SoftCap, len(targets)).Scaled(float64(held.stacks))
	ctx := combat.HitContext{Schools: schoolsOf(e.School, e.Schools, nil), Category: e.Category, Status: id, Kinds: []string{"periodic"}}
	for _, on := range targets {
		h := hit{Type: "hit", From: p.ID(), On: on.ID, Effect: e.Does, Ticked: id, Class: held.class}
		switch e.Does {
		case "damage":
			if on.ID != p.ID() {
				p.fight.attacked(now)
			}
			if l.immuneToDamage(on, ctx.Schools, now) {
				continue
			}
			n, crit := l.rollDamage(p, on, amount, ctx, now)
			h.Crit = crit
			l.harm(p, on, l.soak(on, n, ctx.Schools, &h, now), &h, now)
			l.leech(p, on, n, ctx, "", now)
			l.drain(p, n, e.Drain, "")
			defer l.damaged(p, on, n, crit, ctx, now)
		case "heal":
			n, crit := l.rollHeal(p, on, amount, ctx, now)
			h.Crit = crit
			over := max(on.Health+n-on.MaxHealth, 0)
			on.Health = min(on.Health+n, on.MaxHealth)
			h.Amount = math.Round(n)
			defer l.healedBy(p, on, n, over, ctx, now)
		case "resource":
			o := l.players[on.ID]
			if o == nil {
				continue
			}
			n, _ := combat.Roll(amount, l.statsOf(&p.fight.vitals, nil, now), false, l.hub.roll)
			given, ok := l.addResource(&o.fight, e.Resource, n)
			if !ok {
				continue
			}
			h.Amount, h.Resource = math.Round(given), e.Resource
		default:
			p.debugLine("%s: a periodic that does %s does nothing yet", id, e.Does)
			continue
		}
		p.debugLine("%s on %s ticks: %s %g", id, l.nameOf(on.ID), e.Does, h.Amount)
		h.Health, h.MaxHealth = math.Round(on.Health), on.MaxHealth
		l.sync(on)
		l.tellOf(on.ID, encode(h))
	}
}

// around is who an area periodic reaches around its holder, nearest first.
func (l *Layer) around(e *combat.StatusEffect, at [3]float64, continent string) []*vitals {
	type reach struct {
		v   *vitals
		gap float64
	}
	var found []reach
	l.eachUnit(func(v *vitals, there [3]float64, on string) {
		isEnemy := v.ID < 0 // only dummies are enemies, for now
		if on != continent || isEnemy != (e.Affects == "enemies") {
			return
		}
		if gap := distance(at, there); e.Radius <= 0 || gap <= e.Radius {
			found = append(found, reach{v, gap})
		}
	})
	slices.SortFunc(found, func(a, b reach) int {
		if n := cmp.Compare(a.gap, b.gap); n != 0 {
			return n
		}
		return cmp.Compare(a.v.ID, b.v.ID)
	})
	if e.Max > 0 && len(found) > e.Max {
		found = found[:e.Max]
	}
	out := make([]*vitals, len(found))
	for i, each := range found {
		out[i] = each.v
	}
	return out
}

// consume takes statuses off a unit, or stacks or seconds of them, and does what that's worth.
func (l *Layer) consume(p *Player, c *casting, e *combat.Effect, on *vitals, now time.Time) {
	for _, id := range e.StatusIDs() {
		key := statusKey{id, p.ID()}
		held := on.Statuses[key]
		if held == nil {
			p.debugLine("%s: %s has no %s to consume", c.ability.Name, l.nameOf(on.ID), id)
			continue
		}
		l.fire(statusEvent("statusConsumed", on, key, held), now)
		if on.Statuses[key] != held {
			continue
		}
		taken, window := held.stacks, time.Duration(0)
		if e.Stacks > 0 {
			taken = min(e.Stacks, held.stacks)
		}
		if !held.until.IsZero() {
			window = max(held.until.Sub(now), 0)
			if e.Seconds > 0 {
				window = min(window, seconds(e.Seconds))
			}
		}
		if e.DealsLeft > 0 {
			l.dealLeft(p, c, id, held, e.DealsLeft, taken, window, on, now)
		}
		switch {
		case e.Keeps:
			p.debugLine("%s: %s keeps %s", c.ability.Name, l.nameOf(on.ID), id)
		case e.Stacks > 0 && taken < held.stacks:
			held.stacks -= taken
			l.statusChanged(on.ID, key, held, now)
			p.debugLine("%s: took %d stacks of %s off %s, %d left", c.ability.Name, taken, id, l.nameOf(on.ID), held.stacks)
		case e.Seconds > 0 && !held.until.IsZero() && window < held.until.Sub(now):
			held.until = held.until.Add(-window)
			l.statusChanged(on.ID, key, held, now)
			p.debugLine("%s: took %g s of %s off %s", c.ability.Name, window.Seconds(), id, l.nameOf(on.ID))
		case e.Seconds > 0 && held.until.IsZero():
			p.debugLine("%s: %s has no time to take off %s", c.ability.Name, id, l.nameOf(on.ID))
		default:
			l.takeOff(on, key)
			p.debugLine("%s: took %s off %s", c.ability.Name, id, l.nameOf(on.ID))
		}
		if e.PerStack != nil {
			for n := 0; n < taken; n++ {
				l.landNested(p, c, e.PerStack, on, now)
			}
		}
	}
}

// landNested lands an effect inside another, on the same unit unless it says who it affects.
func (l *Layer) landNested(p *Player, c *casting, e *combat.Effect, on *vitals, now time.Time) {
	if e.Affects == "" {
		l.land(p, c, e, on, 1, now)
		return
	}
	reached := l.reached(p, c, e)
	for _, each := range reached {
		l.land(p, c, e, each, len(reached), now)
	}
}

// dealLeft does a share of what a status had left to do over a stretch of its time, all at once.
func (l *Layer) dealLeft(p *Player, c *casting, id string, held *activeStatus, share float64, stacks int, window time.Duration, on *vitals, now time.Time) {
	for i, each := range held.def.Effects {
		period := held.def.Period(&each)
		if each.Type != "periodic" || period <= 0 {
			continue
		}
		next, ok := held.ticks[i]
		if !ok {
			next = held.since.Add(seconds(period))
		}
		ticks := 0
		if gap := next.Sub(now); gap <= window {
			ticks = 1 + int((window-gap).Seconds()/period)
		}
		if ticks == 0 {
			continue
		}
		ctx := combat.HitContext{Schools: schoolsOf(each.School, nil, c.ability), Category: each.Category, Status: id, Kinds: []string{"periodic"}}
		total, crit := 0.0, false
		for n := 0; n < ticks*stacks; n++ {
			rolled, critical := 0.0, false
			switch each.Does {
			case "damage":
				rolled, critical = l.rollDamage(p, on, each.Amount, ctx, now)
			case "heal":
				rolled, critical = l.rollHeal(p, on, each.Amount, ctx, now)
			}
			total += rolled
			crit = crit || critical
		}
		total *= share
		h := hit{Type: "hit", From: p.ID(), Ability: c.ability.ID, On: on.ID, Effect: each.Does, Crit: crit}
		switch each.Does {
		case "damage":
			if l.immuneToDamage(on, ctx.Schools, now) {
				h.Missed, h.Avoided, h.Crit = true, "immune", false
				break
			}
			l.harm(p, on, l.soak(on, total, ctx.Schools, &h, now), &h, now)
			l.leech(p, on, total, ctx, c.ability.ID, now)
			l.drain(p, total, each.Drain, c.ability.ID)
		case "heal":
			on.Health = min(on.Health+total, on.MaxHealth)
			h.Amount = math.Round(total)
		default:
			continue
		}
		p.debugLine("%s: %s had %d ticks left, %g %s", c.ability.Name, id, ticks*stacks, h.Amount, each.Does)
		h.Health, h.MaxHealth = math.Round(on.Health), on.MaxHealth
		l.sync(on)
		l.tellOf(on.ID, encode(h))
		if each.Does == "damage" {
			l.damaged(p, on, total, crit, ctx, now)
		} else {
			l.healedBy(p, on, total, 0, ctx, now)
		}
	}
}

// extend adds time to statuses on a unit, starts them over, or puts them on if they're missing.
func (l *Layer) extend(p *Player, c *casting, e *combat.Effect, on *vitals, now time.Time) {
	f := &p.fight
	for _, id := range e.StatusIDs() {
		s := f.class.Status(id)
		key := statusKey{id, p.ID()}
		held := on.Statuses[key]
		if held == nil {
			if !e.Apply {
				p.debugLine("%s: %s has no %s to extend", c.ability.Name, l.nameOf(on.ID), id)
				continue
			}
			h := hit{Type: "hit", From: p.ID(), Ability: c.ability.ID, On: on.ID, Effect: "status"}
			if l.applyStatus(p, c.ability, id, e.Duration, on, &h, now) {
				p.debugLine("%s", l.debugHit(p, c.ability.Name, &combat.Effect{Type: "status"}, on, h))
				h.Health, h.MaxHealth = math.Round(on.Health), on.MaxHealth
				l.tellOf(on.ID, encode(h))
			}
			continue
		}
		if held.until.IsZero() {
			p.debugLine("%s: %s has no end to move", c.ability.Name, id)
			continue
		}
		full := 0.0
		if s != nil {
			full = s.Duration
		}
		if e.Duration > 0 {
			full = e.Duration
		}
		if e.Refresh {
			if full > 0 {
				held.until = now.Add(seconds(full))
			}
		} else {
			until := held.until.Add(seconds(e.Seconds + e.PerSpent*c.spent))
			if e.MaxTotal > 0 {
				until = earlier(until, now.Add(seconds(e.MaxTotal)))
			}
			if e.MaxShare > 0 && full > 0 {
				until = earlier(until, now.Add(seconds(full*e.MaxShare)))
			}
			if until.After(held.until) {
				held.until = until
			}
		}
		l.statusChanged(on.ID, key, held, now)
		p.debugLine("%s: %s on %s now has %g s left", c.ability.Name, id, l.nameOf(on.ID), held.until.Sub(now).Seconds())
	}
}

func earlier(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

// statusChanged tells those near a unit how a status on it stands now.
func (l *Layer) statusChanged(unit int64, key statusKey, held *activeStatus, now time.Time) {
	lasts := 0.0
	if !held.until.IsZero() {
		lasts = held.until.Sub(now).Seconds()
	}
	l.tellOf(unit, encode(statusChanged{"statusChanged", unit, key.id, key.from, held.stacks, lasts}))
}

func shownOf(key statusKey, held *activeStatus, now time.Time) shownStatus {
	lasts := 0.0
	if !held.until.IsZero() {
		lasts = held.until.Sub(now).Seconds()
	}
	return shownStatus{key.id, key.from, held.class, held.stacks, lasts}
}

// seen is a character as someone coming across it should see it, with what it holds.
func (l *Layer) seen(c Character) Character {
	var v *vitals
	if d := l.dummy(c.ID, ""); d != nil {
		v = &d.vitals
	} else if o := l.players[c.ID]; o != nil {
		v = &o.fight.vitals
	}
	if v == nil {
		return c
	}
	now := l.hub.now()
	c.Statuses, c.Untargetable, c.Absorb = nil, v.untargetable, v.absorbShown
	if v.lookShown != nil {
		c.Look = v.lookShown
	}
	for key, held := range v.Statuses {
		c.Statuses = append(c.Statuses, shownOf(key, held, now))
	}
	slices.SortFunc(c.Statuses, func(a, b shownStatus) int {
		return cmp.Or(cmp.Compare(a.Status, b.Status), cmp.Compare(a.From, b.From))
	})
	return c
}

// tellOf sends a message about a unit to those who can see it.
func (l *Layer) tellOf(unit int64, b []byte) {
	if d := l.dummy(unit, ""); d != nil {
		for _, o := range l.players {
			if o.state.Continent == d.state.Continent {
				o.send(b)
			}
		}
		return
	}
	if o := l.players[unit]; o != nil {
		l.tell(o, b)
	}
}

// debugLine logs a line for a player with combat debug on.
func (p *Player) debugLine(format string, args ...any) {
	if p.combatDebug {
		answer(p, "debug", fmt.Sprintf(format, args...))
	}
}

// debugHit says what an effect came to and how.
func (l *Layer) debugHit(p *Player, ability string, e *combat.Effect, on *vitals, h hit) string {
	line := fmt.Sprintf("%s on %s: %s", ability, l.nameOf(on.ID), e.Type)
	if h.Missed {
		return line + " missed"
	}
	switch e.Type {
	case "damage", "heal", "resource":
		line += fmt.Sprintf(" %g from %s", h.Amount, combat.DescribeAmount(e.Amount, p.fight.stats))
		if e.Type != "resource" {
			line += fmt.Sprintf(", crit %v", h.Crit)
		}
		if e.Resource != "" {
			line += " " + e.Resource
		}
	case "status":
		line += fmt.Sprintf(" %s for %g s", h.Status, h.Lasts)
	}
	return line
}

// nameOf is a unit's name, for the log.
func (l *Layer) nameOf(id int64) string {
	if d := l.dummy(id, ""); d != nil {
		return d.state.Name
	}
	if o := l.players[id]; o != nil {
		return o.state.Name
	}
	return "someone"
}

// strike rolls an attack on an enemy and does what it comes to, noting it in the hit.
func (l *Layer) strike(p *Player, on *vitals, amount combat.Amount, ctx combat.HitContext, h *hit, now time.Time) {
	blocked := false
	if on.ID != p.ID() {
		p.fight.attacked(now)
		theirs := l.statsOf(on, withOther(ctx, p.ID()), now)
		melee, front := slices.Contains(ctx.Kinds, "melee"), l.seesFromFront(on, p.state.At)
		if l.avoided(on, p.ID(), theirs, melee, front, &ctx, h, now) {
			return
		}
		blocked = combat.Blocks(theirs, melee, front, l.hub.roll)
	}
	if l.immuneToDamage(on, ctx.Schools, now) {
		h.Missed, h.Avoided = true, "immune"
		return
	}
	n, crit := l.rollDamage(p, on, amount, ctx, now)
	h.Crit = crit
	if blocked {
		n *= 1 - combat.BlockShare
		h.Blocked = true
	}
	l.harm(p, on, l.soak(on, n, ctx.Schools, h, now), h, now)
	if blocked {
		l.fire(event{on: "block", who: on, other: p.ID(), ctx: &ctx, amount: n}, now)
	}
	ability := ""
	if ctx.Ability != nil {
		ability = ctx.Ability.ID
	}
	l.leech(p, on, n, ctx, ability, now)
	l.damaged(p, on, n, crit, ctx, now)
}

// avoided rolls an attack on a unit, and says whether it came to nothing. A unit that dodges or
// parries is still in the fight.
func (l *Layer) avoided(on *vitals, from int64, theirs combat.Stats, melee, front bool, ctx *combat.HitContext, h *hit, now time.Time) bool {
	outcome := combat.AttackRoll(theirs, melee, front, l.hub.roll)
	if outcome == "" {
		return false
	}
	h.Missed = true
	if outcome == "miss" {
		return true
	}
	h.Avoided = outcome
	if o := l.players[on.ID]; o != nil {
		o.fight.since["damageTaken"] = now
	}
	l.fire(event{on: outcome, who: on, other: from, ctx: ctx}, now)
	return true
}

// seesFromFront says whether a unit is facing what's at `from`.
func (l *Layer) seesFromFront(on *vitals, from [3]float64) bool {
	if o := l.players[on.ID]; o != nil {
		return facing(o.state.At, o.state.Yaw, from)
	}
	if d := l.dummy(on.ID, ""); d != nil {
		return facing(d.state.At, d.state.Yaw, from)
	}
	return true
}

// statsOf is a unit's stats with what it holds counted. With a hit, stats narrowed to some hits
// count if they match it, and otherwise they don't.
func (l *Layer) statsOf(v *vitals, ctx *combat.HitContext, now time.Time) combat.Stats {
	return combat.Sheet(v.base, v.primary, l.modsOf(v, ctx, now))
}

// modsOf is the stat effects that count for a unit right now.
func (l *Layer) modsOf(v *vitals, ctx *combat.HitContext, now time.Time) []combat.Mod {
	var mods []combat.Mod
	for key, held := range v.Statuses {
		for i := range held.def.Effects {
			e := &held.def.Effects[i]
			if e.Type != "stat" || !e.Applies(ctx, key.from) || !l.holds(v, e, ctx, now) {
				continue
			}
			mod := combat.Mod{Effect: e, Stacks: held.stacks, Spent: held.spent}
			if o := l.players[key.from]; o != nil {
				mod.Caster = &o.fight.vitals.base
			}
			mods = append(mods, mod)
		}
	}
	return mods
}

// holds says whether a stat's own conditions hold for the unit holding it.
func (l *Layer) holds(v *vitals, e *combat.StatusEffect, ctx *combat.HitContext, now time.Time) bool {
	if len(e.When) == 0 {
		return true
	}
	facts := &combat.Facts{Self: unitOf(v, v.ID, nil), Since: map[string]float64{}, Resources: map[string]combat.ResourceAmount{}}
	if o := l.players[v.ID]; o != nil {
		target := int64(0)
		if ctx != nil {
			target = ctx.Other
		}
		facts = l.facts(o, target, now)
	}
	_, ok := combat.All(e.When, facts)
	return ok
}

// withOther is a hit as seen by one end of it, with `other` at the far end.
func withOther(ctx combat.HitContext, other int64) *combat.HitContext {
	ctx.Other = other
	return &ctx
}

// rollDamage is what a hit comes to, by the stats of who does it and who takes it.
func (l *Layer) rollDamage(p *Player, on *vitals, amount combat.Amount, ctx combat.HitContext, now time.Time) (float64, bool) {
	amount = amount.On(on.MaxHealth)
	mine, theirs := l.statsOf(&p.fight.vitals, withOther(ctx, on.ID), now), l.statsOf(on, withOther(ctx, p.ID()), now)
	rolled := mine
	rolled.CritChance += theirs.CritTaken + ctx.CritChance
	rolled.CritDamage += ctx.CritDamage
	amount, rolled = combat.WithCritRules(amount, rolled, ctx)
	n, crit := combat.Roll(amount, rolled, true, l.hub.roll)
	before := n
	n = theirs.Taken(n*mine.DamageDone*(1+mine.Versatility()/100), ctx, mine.Level)
	if n != before {
		p.debugLine("damage %g comes to %g from stats", before, n)
	}
	return n, crit
}

// rollHeal is what a heal comes to, by the stats of who does it and who takes it.
func (l *Layer) rollHeal(p *Player, on *vitals, amount combat.Amount, ctx combat.HitContext, now time.Time) (float64, bool) {
	amount = amount.On(on.MaxHealth)
	mine, theirs := l.statsOf(&p.fight.vitals, withOther(ctx, on.ID), now), l.statsOf(on, withOther(ctx, p.ID()), now)
	rolled := mine
	rolled.CritChance += ctx.CritChance
	rolled.CritDamage = mine.CritHealing + ctx.CritDamage
	amount, rolled = combat.WithCritRules(amount, rolled, ctx)
	n, crit := combat.Roll(amount, rolled, true, l.hub.roll)
	if times := mine.HealingDone * theirs.HealingTaken * (1 + mine.Versatility()/100); times != 1 {
		p.debugLine("healing %g x %g from stats", n, times)
		n *= times
	}
	return n, crit
}

// leech heals a player by its share of the damage it did to another.
func (l *Layer) leech(p *Player, on *vitals, n float64, ctx combat.HitContext, ability string, now time.Time) {
	if on.ID == p.ID() {
		return
	}
	l.drain(p, n, l.statsOf(&p.fight.vitals, withOther(ctx, on.ID), now).Leech/100, ability)
}

// drain heals a player by a share of what it did.
func (l *Layer) drain(p *Player, n, share float64, ability string) {
	f := &p.fight.vitals
	back := min(n*share, f.MaxHealth-f.Health)
	if back <= 0 {
		return
	}
	f.Health += back
	l.sync(f)
	l.tell(p, encode(hit{Type: "hit", From: p.ID(), Ability: ability, On: p.ID(), Effect: "heal", Amount: math.Round(back), Health: math.Round(f.Health), MaxHealth: f.MaxHealth}))
}

// schoolsOf is the schools a hit counts as: its own, or else its ability's.
func schoolsOf(school string, schools []string, a *combat.Ability) []string {
	switch {
	case len(schools) > 0:
		return schools
	case school != "":
		return []string{school}
	case a != nil && len(a.Schools) > 0:
		return a.Schools
	case a != nil && a.School != "":
		return []string{a.School}
	}
	return nil
}

// hitOf describes an ability's effect landing on a unit, out of `count` it reached.
func hitOf(c *casting, e *combat.Effect, on *vitals, count int) combat.HitContext {
	kinds := []string{"ability", "direct"}
	if c.ability.Range.Melee {
		kinds = append(kinds, "melee")
	}
	if e.Affects == "enemies" || e.Affects == "allies" {
		kinds = append(kinds, "area")
	}
	if on.ID == c.target || e.Affects == "self" || e.Affects == "target" {
		kinds = append(kinds, "main")
	} else {
		kinds = append(kinds, "others")
	}
	if count == 1 {
		kinds = append(kinds, "single")
	}
	return combat.HitContext{Schools: schoolsOf(e.School, e.Schools, c.ability), Category: e.Category, Ability: c.ability, Kinds: kinds, Hits: count, CritChance: e.CritChance, CritDamage: e.CritDamage}
}

// refit brings what's kept from a unit's stats up to date: its most health, keeping the share it
// has, and a player's speed.
func (l *Layer) refit(v *vitals, now time.Time) {
	o := l.players[v.ID]
	if look := lookOn(v); !bytes.Equal(look, v.lookShown) {
		v.lookShown = look
		l.tellOf(v.ID, encode(lookMessage{"look", v.ID, look}))
	}
	if left := math.Round(absorbOn(v)); left != v.absorbShown {
		v.absorbShown = left
		l.tellOf(v.ID, encode(absorbMessage{"absorb", v.ID, left}))
	}
	if len(v.Statuses) == 0 && v.MaxHealth == v.base.MaxHealth && !v.untargetable && (o == nil || (o.motion.settled() && len(o.fight.controls) == 0)) {
		return
	}
	if out := l.untargetable(v, now); out != v.untargetable {
		v.untargetable = out
		l.tellOf(v.ID, encode(targetable{"targetable", v.ID, !out}))
	}
	stats := l.statsOf(v, nil, now)
	if most := max(stats.MaxHealth, 1); most != v.MaxHealth {
		v.Health *= most / v.MaxHealth
		v.MaxHealth = most
		l.sync(v)
		l.tellOf(v.ID, encode(healthMessage{"health", v.ID, math.Round(v.Health), v.MaxHealth}))
	}
	if o == nil {
		return
	}
	speed := max(stats.MovementSpeed, 0)
	if controls := l.controlsOn(v); !slices.Equal(controls, o.fight.controls) {
		o.fight.controls = controls
		o.send(encode(controlsMessage{"controls", controls}))
		if c := o.fight.cast; c != nil && combat.Blocked(controls, c.ability) != "" {
			l.stopCast(o)
		}
	}
	if combat.HoldsStill(o.fight.controls) {
		speed = 0
	}
	if o.motion.setSpeed(speed/100, now) {
		o.send(encode(speedMessage{"speed", speed}))
	}
}

// controlsOn is the controls a unit's statuses hold it with, sorted, each once, less those it's immune to.
func (l *Layer) controlsOn(v *vitals) []string {
	var out []string
	now := l.hub.now()
	for _, held := range v.Statuses {
		for _, c := range held.def.Controls() {
			if !l.immuneTo(v, c, now) {
				out = append(out, c)
			}
		}
	}
	slices.Sort(out)
	return slices.Compact(out)
}

// immunities calls f with each `immune` effect a unit holds right now, until it says true, and
// says whether it did.
func (l *Layer) immunities(v *vitals, now time.Time, f func(e *combat.StatusEffect) bool) bool {
	for _, held := range v.Statuses {
		for i := range held.def.Effects {
			if e := &held.def.Effects[i]; e.Type == "immune" && l.holds(v, e, nil, now) && f(e) {
				return true
			}
		}
	}
	return false
}

// immuneTo says whether a unit is immune to a kind of control.
func (l *Layer) immuneTo(v *vitals, control string, now time.Time) bool {
	return l.immunities(v, now, func(e *combat.StatusEffect) bool { return e.All || slices.Contains(e.Controls, control) })
}

// immuneToDamage says whether a unit takes nothing from a hit of these schools.
func (l *Layer) immuneToDamage(v *vitals, schools []string, now time.Time) bool {
	return l.immunities(v, now, func(e *combat.StatusEffect) bool {
		if e.All {
			return true
		}
		return slices.ContainsFunc(e.Schools, func(school string) bool { return slices.Contains(schools, school) })
	})
}

// immuneToStatus says whether a status from someone else bounces off a unit: it's harmful, or
// holds with a control it's immune to. You can always do it to yourself.
func (l *Layer) immuneToStatus(v *vitals, s *combat.Status, from int64, now time.Time) bool {
	if v.ID == from {
		return false
	}
	if s.Kind == "debuff" && l.immunities(v, now, func(e *combat.StatusEffect) bool { return e.All || e.Harmful }) {
		return true
	}
	if slices.ContainsFunc(s.Controls(), func(c string) bool { return l.immuneTo(v, c, now) }) {
		return true
	}
	return s.Slows() && l.immuneTo(v, "slow", now)
}

// untargetable says whether nothing can pick a unit as a target right now.
func (l *Layer) untargetable(v *vitals, now time.Time) bool {
	for _, held := range v.Statuses {
		for i := range held.def.Effects {
			e := &held.def.Effects[i]
			if e.Type != "untargetable" || !l.holds(v, e, nil, now) || now.Sub(held.since).Seconds() < e.AfterSeconds {
				continue
			}
			if e.OnlyBelow == 0 || (v.MaxHealth > 0 && v.Health/v.MaxHealth*100 < e.OnlyBelow) {
				return true
			}
		}
	}
	return false
}

// harm takes health off a unit, noting it in the hit.
func (l *Layer) harm(p *Player, on *vitals, n float64, h *hit, now time.Time) {
	if n > 0 {
		on.recent = append(on.recent, taken{now, n})
		for len(on.recent) > 0 && now.Sub(on.recent[0].at) > recentDamageLasts {
			on.recent = on.recent[1:]
		}
	}
	if o := l.players[on.ID]; o != nil {
		o.fight.since["damageTaken"] = now
	}
	on.Health = max(on.Health-n, 0)
	h.Amount = math.Round(n)
	l.breakStatuses(on, "damage", nil)
	if d := l.dummy(on.ID, p.state.Continent); d != nil {
		d.tally(n, now)
		h.DPS = math.Round(d.dps(now))
		on.Health = max(on.Health, 1) // it never dies
	}
}

// attack starts or stops a player's auto-attack, as it asks.
func (l *Layer) attack(p *Player, m incoming) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.players[p.ID()] != p || p.fight.class == nil {
		return
	}
	if m.Target == 0 {
		l.stopAttacking(p)
		return
	}
	d := l.dummy(m.Target, p.state.Continent)
	if d == nil {
		p.send(encode(refused{Type: "refused", Why: "you need an enemy targeted"}))
		return
	}
	if l.untargetable(&d.vitals, l.hub.now()) {
		p.send(encode(refused{Type: "refused", Why: "you can't target that"}))
		return
	}
	l.startAttacking(p, m.Target)
}

func (l *Layer) startAttacking(p *Player, target int64) {
	f := &p.fight
	if f.attacking != target {
		f.attacking, f.swingWhy = target, ""
		p.send(encode(attacking{"attacking", target}))
	}
}

func (l *Layer) stopAttacking(p *Player) {
	f := &p.fight
	if f.attacking != 0 {
		f.attacking, f.swingWhy = 0, ""
		p.send(encode(attacking{"attacking", 0}))
	}
}

// swing starts an auto-attack swing if it's time and the target's in reach. A swing waits for a
// cast to end, and for the target to come into reach and in front of you.
func (l *Layer) swing(p *Player, now time.Time) {
	f := &p.fight
	if f.attacking == 0 || f.cast != nil || now.Before(f.swingAt) || !combat.CanSwing(l.controlsOn(&f.vitals)) {
		return
	}
	d := l.dummy(f.attacking, p.state.Continent)
	if d == nil || l.untargetable(&d.vitals, now) {
		l.stopAttacking(p)
		return
	}
	why := ""
	if distance(p.state.At, d.state.At) > combat.MeleeFt {
		why = "out of range"
	} else if !facing(p.state.At, p.state.Yaw, d.state.At) {
		why = "you're not facing it"
	} else if !l.sees(p.state.Continent, p.state.At, d.state.At) {
		why = cantSee
	}
	if why != "" {
		if why != f.swingWhy {
			p.send(encode(refused{Type: "refused", Why: why}))
		}
		f.swingWhy = why
		return
	}
	f.swingWhy = ""
	sheet := l.statsOf(&f.vitals, nil, now)
	f.swingAt = now.Add(seconds(sheet.Hasted(combat.SwingSeconds) * 100 / max(sheet.AttackSpeed, 1)))
	l.breakStatuses(&f.vitals, "action", func(s *combat.Status) bool { return s.KeptBy != nil })
	target := d.ID
	l.tell(p, encode(swung{"swung", p.ID(), target}))
	l.after(now.Add(strikeDelay), nil, func(now time.Time) {
		d := l.dummy(target, "")
		if l.players[p.ID()] != p || d == nil {
			return
		}
		h := hit{Type: "hit", From: p.ID(), On: target, Effect: "damage"}
		ctx := combat.HitContext{Schools: []string{"physical"}, Kinds: []string{"auto", "melee", "direct", "main", "single"}}
		l.strike(p, &d.vitals, combat.Amount{Weapon: 1}, ctx, &h, now)
		h.Health, h.MaxHealth = math.Round(d.Health), d.MaxHealth
		l.sync(&d.vitals)
		l.tell(p, encode(h))
	})
}

// spar has the nearest dummy in reach swing back at a player who asked for that. It's how you try
// out what happens when you're hit, while nothing else in the world attacks. It can't kill you.
func (l *Layer) spar(p *Player, now time.Time) {
	f := &p.fight
	if !f.sparring || now.Before(f.sparAt) {
		return
	}
	var d *dummy
	for _, each := range l.dummies {
		if each.state.Continent == p.state.Continent && distance(p.state.At, each.state.At) <= combat.MeleeFt && (d == nil || distance(p.state.At, each.state.At) < distance(p.state.At, d.state.At)) {
			d = each
		}
	}
	if d == nil || !combat.CanSwing(l.controlsOn(&d.vitals)) {
		return
	}
	f.sparAt = now.Add(seconds(combat.SwingSeconds))
	on := &f.vitals
	l.tell(p, encode(swung{"swung", d.ID, p.ID()}))
	ctx := combat.HitContext{Schools: []string{"physical"}, Kinds: []string{"auto", "melee", "direct", "main", "single"}, Other: d.ID}
	h := hit{Type: "hit", From: d.ID, On: p.ID(), Effect: "damage"}
	theirs := l.statsOf(on, &ctx, now)
	front := facing(p.state.At, p.state.Yaw, d.state.At)
	if !l.avoided(on, d.ID, theirs, true, front, &ctx, &h, now) {
		n := theirs.Taken(on.MaxHealth*sparShare, ctx, f.level)
		blocked := combat.Blocks(theirs, true, front, l.hub.roll)
		if blocked {
			n *= 1 - combat.BlockShare
			h.Blocked = true
		}
		n = l.soak(on, n, ctx.Schools, &h, now)
		n = min(n, on.Health-1)
		l.harm(p, on, max(n, 0), &h, now)
		if blocked {
			l.fire(event{on: "block", who: on, other: d.ID, ctx: &ctx, amount: n}, now)
		}
		l.fire(event{on: "takeDamage", who: on, other: d.ID, ctx: &ctx, amount: n}, now)
	}
	h.Health, h.MaxHealth = math.Round(on.Health), on.MaxHealth
	l.sync(on)
	l.tell(p, encode(h))
}

// addResource gives a fighter some of a resource, or takes it with a negative amount. It says
// how much that came to with resourceGain, and whether the fighter has the resource.
func (l *Layer) addResource(f *fighter, key string, n float64) (float64, bool) {
	for _, r := range f.class.Resources {
		if r.Key == key {
			pool := f.pool(r)
			if n > 0 {
				n *= pool.Gain
			}
			f.resources[key] = max(0, min(pool.Max, f.resources[key]+n))
			f.resChanged = true
			return n, true
		}
	}
	return 0, false
}

// pool is how a resource behaves for a fighter. Until the first tick that's its class's numbers.
func (f *fighter) pool(r combat.Resource) combat.Pool {
	if pool, ok := f.pools[r.Key]; ok {
		return pool
	}
	return combat.PoolOf(r, f.vitals.base, f.vitals.primary, nil)
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
		o.state.Health, o.state.MaxHealth = on.Health, on.MaxHealth
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
		if c.ability.Target != "enemy" && c.ability.Target != "ally" && c.ability.Target != "any" {
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
	way := [2]float64{}
	if e.Line {
		way = lineWay(p, c, e, center)
	}
	a := areaOf{center: center, continent: p.state.Continent, yaw: p.state.Yaw, affects: e.Affects, radius: e.Radius, cone: e.Cone, line: e.Line, width: e.Width, dir: way, most: e.Max, prefers: e.Prefers, from: p.ID(), holding: e.Holding}
	if e.Type != "move" {
		a.height = e.Height
	}
	if e.ExceptTarget {
		a.except = c.target
	}
	return l.inArea(a)
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

// interruptMoving ends a cast its caster has moved during, and the statuses that break on moving.
func (l *Layer) interruptMoving(p *Player) {
	if c := p.fight.cast; c != nil && !c.ability.CastWhileMoving && movingNow(p.state.Move) {
		l.stopCast(p)
	}
	if movingNow(p.state.Move) {
		l.breakStatuses(&p.fight.vitals, "move", nil)
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
		l.swing(p, now)
		l.spar(p, now)
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
	}
	l.sweep(now)
}

// regen brings back resources and tells the player how they stand, every so often.
func (l *Layer) regen(p *Player, dt float64, now time.Time) {
	f := &p.fight
	if f.class == nil {
		return
	}
	mods := l.modsOf(&f.vitals, nil, now)
	sheet := f.vitals.base
	if len(mods) > 0 {
		sheet = combat.Sheet(f.vitals.base, f.vitals.primary, mods)
	}
	fighting := f.inCombat(now)
	for _, r := range f.class.Resources {
		pool := combat.PoolOf(r, sheet, f.vitals.primary, mods)
		if old, ok := f.pools[r.Key]; ok && old.Max != pool.Max {
			f.resChanged = true
		}
		f.pools[r.Key] = pool
		was := f.resources[r.Key]
		f.resources[r.Key] = pool.After(was, dt, fighting)
		if f.resources[r.Key] != was {
			f.resChanged = true
		}
	}
	if f.resChanged && now.Sub(f.sentAt) >= resourceEvery {
		out, most := map[string]float64{}, map[string]float64{}
		for _, r := range f.class.Resources {
			out[r.Key], most[r.Key] = shownResource(r, f.resources[r.Key]), math.Round(f.pool(r).Max)
		}
		p.send(encode(resources{"resources", out, most}))
		f.sentAt, f.resChanged = now, false
	}
}

// shownResource is what a player sees of a resource. Points only count once they're whole, so a
// part-earned point doesn't show as one you can spend.
func shownResource(r combat.Resource, have float64) float64 {
	if r.Kind == "points" {
		return math.Floor(have)
	}
	return math.Round(have)
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
