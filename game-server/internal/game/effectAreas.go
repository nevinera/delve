package game

import (
	"cmp"
	"math"
	"slices"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

const randomEffectAreaFt = 20.0 // how far from you an effect area `around` `random` can land

// effectArea is an effect area on the ground or an aura on a unit: while it lasts it keeps a status on those
// inside and lands its effects on them.
type effectArea struct {
	id       int64 // 0 for an aura, which nobody draws
	follows  int64 // the unit an effect area moves with, if any
	from     *unit
	kind     string // copies of the same kind don't stack unless they overlap
	ability  *combat.Ability
	center   func() ([3]float64, string, bool)
	affects  string
	radius   float64
	line     bool
	width    float64
	dir      [2]float64 // which way a line runs
	max      int
	status   string
	every    float64
	effects  []combat.Effect
	onEnter  *combat.Effect
	overlaps bool
	until    time.Time // zero for an aura, which lasts as long as its status
	next     time.Time
	inside   map[int64]*unit
}

// placeEffectArea does an `effectArea` effect: it stays where it lands and works on its own from then on.
func (cm *Combat) placeEffectArea(u *unit, c *casting, e *combat.Effect, now time.Time) {
	continent := u.char.Continent
	at, ok := u.char.At, true
	var follows int64
	switch e.Around {
	case "target":
		at, ok = cm.pointOf(c, u)
		if e.FollowsTarget {
			follows = c.target
		}
	case "ground":
		at, ok = cm.pointOf(c, u)
	case "random":
		angle, gap := 2*math.Pi*cm.roll(), randomEffectAreaFt*cm.roll()
		at[0] += math.Sin(angle) * gap
		at[2] += math.Cos(angle) * gap
		if g := cm.state.ground(continent); g != nil {
			if s, known, err := g.At(at[0], at[2]); known && err == nil {
				at[1] = standingOn(s, at[1])
			}
		}
	}
	if !ok {
		u.debugLine("%s: nowhere for its effect area to go", c.ability.Name)
		return
	}
	z := cm.newEffectArea(u, c.ability, e.Affects, e.Radius, e.Max, e.Status, e.Every, effectsIn(e), e.OnEnter)
	z.id, z.overlaps = cm.nextEffectArea(), e.Overlaps
	z.line, z.width, z.dir = e.Line, e.Width, lineWay(u, c, e, at)
	z.until = now.Add(seconds(e.Lasts))
	z.center = func() ([3]float64, string, bool) { return at, continent, true }
	z.follows = follows
	if follows != 0 {
		z.center = func() ([3]float64, string, bool) { return cm.unitAt(follows, at, continent) }
	}
	if e.Limit > 0 {
		cm.limitEffectAreas(u, z.kind, e.Limit-1)
	}
	cm.addEffectArea(z, continent, now)
	u.debugLine("%s: an effect area %.0f ft across for %g s", c.ability.Name, e.Radius, e.Lasts)
}

func (cm *Combat) nextEffectArea() int64 {
	cm.effectAreaCount++
	return cm.effectAreaCount
}

func (cm *Combat) newEffectArea(u *unit, a *combat.Ability, affects string, radius float64, most int, status string, every float64, effects []combat.Effect, onEnter *combat.Effect) *effectArea {
	return &effectArea{from: u, kind: a.ID, ability: a, affects: affects, radius: radius, max: most, status: status, every: every, effects: effects, onEnter: onEnter, inside: map[int64]*unit{}, next: cm.now().Add(seconds(every))}
}

// effectsIn is what an effect area does each `every`.
func effectsIn(e *combat.Effect) []combat.Effect {
	if e.Effect != nil {
		return append([]combat.Effect{*e.Effect}, e.Effects...)
	}
	return e.Effects
}

// lineWay is the way a line runs from where it starts.
func lineWay(u *unit, c *casting, e *combat.Effect, from [3]float64) [2]float64 {
	if e.Along == "ground" && c.spot != nil {
		dx, dz := c.spot[0]-from[0], c.spot[2]-from[2]
		if gap := math.Hypot(dx, dz); gap > 0 {
			return [2]float64{dx / gap, dz / gap}
		}
	}
	return [2]float64{math.Sin(u.char.Yaw), math.Cos(u.char.Yaw)}
}

// unitAt is where a unit is on a continent, or where it was last known to be if it's gone.
func (cm *Combat) unitAt(id int64, was [3]float64, continent string) ([3]float64, string, bool) {
	if u := cm.state.unit(id, ""); u != nil {
		return u.char.At, u.char.Continent, true
	}
	return was, continent, false
}

// limitEffectAreas ends a player's oldest effect areas of a kind, until `keep` are left.
func (cm *Combat) limitEffectAreas(u *unit, kind string, keep int) {
	var mine []*effectArea
	for _, z := range cm.effectAreas {
		if z.from == u && z.kind == kind {
			mine = append(mine, z)
		}
	}
	for i := 0; i < len(mine)-keep; i++ {
		cm.endEffectArea(mine[i])
	}
}

// addEffectArea puts an effect area on the ground, and shows it to those on its continent.
func (cm *Combat) addEffectArea(z *effectArea, continent string, now time.Time) {
	cm.effectAreas = append(cm.effectAreas, z)
	cm.state.tellContinent(continent, encode(effectAreaMessageOf(z, now)))
}

// endEffectArea takes an effect area away, letting go of those inside it, and takes its effect area off the ground.
func (cm *Combat) endEffectArea(z *effectArea) {
	for id := range z.inside {
		cm.leaveEffectArea(z, id)
	}
	if i := slices.Index(cm.effectAreas, z); i >= 0 {
		cm.effectAreas = slices.Delete(cm.effectAreas, i, i+1)
	}
	if z.id != 0 {
		if _, continent, ok := z.center(); ok {
			cm.state.tellContinent(continent, encode(effectAreaGone{"effectAreaGone", z.id}))
		} else {
			for o := range cm.state.playerUnits() {
				o.send(encode(effectAreaGone{"effectAreaGone", z.id}))
			}
		}
	}
}

func (cm *Combat) leaveEffectArea(z *effectArea, id int64) {
	on := z.inside[id]
	delete(z.inside, id)
	key := statusKey{z.status, z.from.ID}
	if on != nil && z.status != "" && on.Statuses[key] != nil && on.Statuses[key].effectArea == z {
		cm.takeOff(on, key)
	}
}

// sweepEffectAreas keeps effect areas and auras up to date.
func (cm *Combat) sweepEffectAreas(now time.Time) {
	for _, z := range slices.Clone(cm.effectAreas) {
		if !cm.state.present(z.from) || !now.Before(z.until) {
			cm.endEffectArea(z)
			continue
		}
		cm.touchEffectArea(z, now)
	}
	type aura struct {
		v    *unit
		key  statusKey
		held *activeStatus
		i    int
	}
	var auras []aura
	for v := range cm.state.units() {
		for key, held := range v.Statuses {
			for i := range held.def.Effects {
				if held.def.Effects[i].Type == "aura" {
					auras = append(auras, aura{v, key, held, i})
				}
			}
		}
	}
	for _, a := range auras {
		from := cm.state.caster(a.key.from)
		if from == nil || a.v.Statuses[a.key] != a.held {
			continue
		}
		z := a.held.effectAreas[a.i]
		if z == nil {
			e := &a.held.def.Effects[a.i]
			var effects []combat.Effect
			if e.Effect != nil {
				effects = []combat.Effect{*e.Effect}
			}
			z = cm.newEffectArea(from, &combat.Ability{ID: a.held.def.ID, Name: a.held.def.Name}, e.Affects, e.Radius, e.Max, e.Status, e.Every, effects, nil)
			id := a.v.ID
			z.center = func() ([3]float64, string, bool) { return cm.unitAt(id, [3]float64{}, "") }
			if a.held.effectAreas == nil {
				a.held.effectAreas = map[int]*effectArea{}
			}
			a.held.effectAreas[a.i] = z
		}
		cm.touchEffectArea(z, now)
	}
}

// endEffectAreas ends the auras of a status that's coming off.
func (cm *Combat) endEffectAreas(held *activeStatus) {
	for _, z := range held.effectAreas {
		cm.endEffectArea(z)
	}
}

// touchEffectArea works out who's inside an effect area and does what's due to them.
func (cm *Combat) touchEffectArea(z *effectArea, now time.Time) {
	center, continent, ok := z.center()
	if !ok {
		cm.endEffectArea(z)
		return
	}
	found := cm.inEffectArea(effectShape{center: center, continent: continent, affects: z.affects, radius: z.radius, line: z.line, width: z.width, dir: z.dir, most: z.max})
	here := map[int64]bool{}
	c := &casting{ability: z.ability}
	for _, on := range found {
		here[on.ID] = true
		if z.inside[on.ID] != nil {
			continue
		}
		z.inside[on.ID] = on
		if z.onEnter != nil {
			cm.effectAreaLands(z, c, z.onEnter, on, len(found), now)
		}
		if z.status != "" {
			cm.keepStatus(z, on, now)
		}
	}
	for id := range z.inside {
		if !here[id] {
			cm.leaveEffectArea(z, id)
		}
	}
	if z.every <= 0 || now.Before(z.next) {
		return
	}
	z.next = z.next.Add(seconds(z.every))
	for _, on := range found {
		if !z.overlaps && cm.olderEffectAreaHas(z, on.ID) {
			continue
		}
		for i := range z.effects {
			cm.effectAreaLands(z, c, &z.effects[i], on, len(found), now)
		}
	}
}

// olderEffectAreaHas says whether an older copy of an effect area is already working on a unit.
func (cm *Combat) olderEffectAreaHas(z *effectArea, id int64) bool {
	for _, other := range cm.effectAreas {
		if other == z {
			return false
		}
		if other.from == z.from && other.kind == z.kind && other.inside[id] != nil {
			return true
		}
	}
	return false
}

// effectAreaLands lands an effect on someone inside an effect area. `self` there means them.
func (cm *Combat) effectAreaLands(z *effectArea, c *casting, e *combat.Effect, on *unit, count int, now time.Time) {
	if _, ok := combat.All(e.When, cm.facts(z.from, on.ID, now)); !ok {
		return
	}
	runner := z.from
	if cm.state.present(on) && e.Type == "resource" {
		runner = on
	}
	cm.land(runner, c, e, on, count, now)
}

// keepStatus puts an effect area's status on someone inside, for as long as they stay.
func (cm *Combat) keepStatus(z *effectArea, on *unit, now time.Time) {
	key := statusKey{z.status, z.from.ID}
	if on.Statuses[key] != nil {
		return
	}
	h := hit{}
	if !cm.applyStatus(z.from, z.ability, z.status, 0, on, &h, now) {
		return
	}
	if held := on.Statuses[key]; held != nil {
		held.effectArea, held.until = z, time.Time{}
		cm.statusChanged(on.ID, key, held, now)
	}
}

// effectShape is a place to find units in.
type effectShape struct {
	center    [3]float64
	continent string
	yaw       float64
	affects   string
	radius    float64
	cone      float64
	line      bool
	width     float64
	dir       [2]float64
	most      int
	prefers   string
	height    float64  // how far up and down it reaches, if it says
	except    int64    // leaves this one out
	from      int64    // whose statuses `holding` asks about
	holding   []string // only those holding one of these from `from`, wherever they are
}

// inEffectArea is who of a side is in an area, nearest first, up to its most.
func (cm *Combat) inEffectArea(a effectShape) []*unit {
	var found []reach
	for u := range cm.state.units() {
		if u.char.Continent != a.continent || !a.side(u) || !a.counts(u) {
			continue
		}
		gap, ok := a.reaches(u.char.At)
		if ok && len(a.holding) == 0 {
			ok = cm.sees(a.continent, a.center, u.char.At)
		}
		if ok {
			found = append(found, reach{u, gap})
		}
	}
	return a.ranked(found)
}

// reach is a unit an effect area reaches, and how far it is from the effect area's middle.
type reach struct {
	v   *unit
	gap float64
}

// side says whether a unit is on the side an effect area affects. Mobs are enemies, and players allies.
func (a effectShape) side(u *unit) bool {
	switch a.affects {
	case "enemies":
		return u.mob != nil
	case "allies":
		return u.fight != nil
	}
	return false
}

// reaches says whether `at` is within the area's shape, and how far it is from its middle. An
// effect area of those `holding` something reaches them wherever they are.
func (a effectShape) reaches(at [3]float64) (float64, bool) {
	gap := distance(a.center, at)
	if a.height > 0 && math.Abs(at[1]-a.center[1]) > a.height {
		return gap, false
	}
	if len(a.holding) > 0 {
		return gap, true
	}
	if a.line {
		dx, dz := at[0]-a.center[0], at[2]-a.center[2]
		along, across := dx*a.dir[0]+dz*a.dir[1], dx*a.dir[1]-dz*a.dir[0]
		return gap, along >= 0 && along <= a.radius && math.Abs(across) <= a.width/2
	}
	if a.radius > 0 && gap > a.radius {
		return gap, false
	}
	return gap, a.cone == 0 || withinCone(a.center, a.yaw, a.cone, at)
}

// ranked is those found in the order the area prefers them, nearest first by default, up to its
// most.
func (a effectShape) ranked(found []reach) []*unit {
	slices.SortFunc(found, func(x, y reach) int {
		switch a.prefers {
		case "farthest":
			x, y = y, x
		case "lowestHealth":
			if c := cmp.Compare(x.v.Health, y.v.Health); c != 0 {
				return c
			}
		case "injured":
			if c := cmp.Compare(x.v.Health/max(x.v.MaxHealth, 1), y.v.Health/max(y.v.MaxHealth, 1)); c != 0 {
				return c
			}
		}
		return cmp.Or(cmp.Compare(x.gap, y.gap), cmp.Compare(x.v.ID, y.v.ID))
	})
	if a.most > 0 && len(found) > a.most {
		found = found[:a.most]
	}
	out := make([]*unit, len(found))
	for i, r := range found {
		out[i] = r.v
	}
	return out
}

// counts says whether a unit in an effect area is one it's after.
func (a effectShape) counts(v *unit) bool {
	if v.ID == a.except && a.except != 0 {
		return false
	}
	if len(a.holding) == 0 {
		return true
	}
	return slices.ContainsFunc(a.holding, func(id string) bool { return v.Statuses[statusKey{id, a.from}] != nil })
}

func (l *Layer) tellContinent(continent string, b []byte) {
	for _, o := range l.players {
		if o.state.Continent == continent {
			o.send(b)
		}
	}
}

// effectAreaMessageOf is an effect area as those on its continent see it.
func effectAreaMessageOf(z *effectArea, now time.Time) effectAreaMessage {
	at, _, _ := z.center()
	return effectAreaMessage{"effectArea", z.id, z.from.ID, z.ability.ID, z.affects, at, z.radius, z.line, z.width, z.dir, z.until.Sub(now).Seconds(), z.follows}
}
