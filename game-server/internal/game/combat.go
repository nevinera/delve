package game

import (
	"cmp"
	"encoding/json"
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
	dummyResetIdle = 5 * time.Second // a dummy's tally starts over after this long unhit
	combatLasts    = 5 * time.Second // you're in combat until this long after you last attacked or were hit
	resourceEvery  = 500 * time.Millisecond
	sparShare      = 0.05 // what a dummy's swing takes of your most health
	refreshKeeps   = 0.3  // the share of a status's duration that a refresh can keep of what was left
)

// unit is anyone combat acts on: a player's character or a training dummy, with what can be hurt
// and healed and what it holds.
type unit struct {
	ID        int64
	char      *Character // where it is and how it's seen
	player    *Player    // the player it is, or nil for a mob
	mob       *mob       // the mob it is, or nil for a player
	fight     *fighter   // its side of combat, if it's a player
	Health    float64
	MaxHealth float64
	Statuses  map[statusKey]*activeStatus
	base      combat.Stats // what its class and level give it, before what it holds

	untargetable bool            // as it's last been told
	lookShown    json.RawMessage // what a `transform` shows it as, as it's last been told
	absorbShown  float64         // as it's last been told
	recent       []taken         // damage it's taken lately
	primary      []string        // its class's main stats
}

// statusKey picks out one copy of a status: a unit holds one for each unit that put it on.
type statusKey struct {
	id   string
	from int64
}

// activeStatus is a status on a unit, until it runs out. With no `until`, it stays until removed.
type activeStatus struct {
	def         *combat.Status
	class       string
	since       time.Time // when it was last put on
	until       time.Time
	stacks      int
	uses        int                 // what's left of `consumedBy.uses`
	fired       map[int]time.Time   // when each of its triggers last fired, by its place in the status
	counts      map[int]float64     // how far along each `every` is, by the same
	granted     bool                // what the class gives you for good: a passive, your mastery, a spec's or a talent's
	ticks       map[int]time.Time   // when each of its periodic effects next ticks, by its place in the status
	spent       float64             // what the ability that applied it spent
	absorb      float64             // what its `absorb` has left
	stored      float64             // what it holds for `stored` amounts
	effectArea  *effectArea         // the effect area or aura keeping it on, if any
	effectAreas map[int]*effectArea // its own auras, by their place in the status
	owner       *combat.Class       // the class it came from
}

// mob is a unit that isn't a player. A training dummy is a mob that's always at full health, never
// fights back unless you spar with it, and tallies what hits it.
type mob struct {
	unit
	state    Character
	training bool // it's a training dummy
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
	unit       unit
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

// The most a character's action bars can hold, and the longest an ability id can be.
const (
	maxBars    = 3
	maxSlots   = 12
	maxSlotLen = 64
)

const maxCastDepth = 4 // how many abilities can cast each other in a row

// cantSee is why you can't use something on what's out of your sight.
const cantSee = "you can't see that"

const (
	maxSeesPerSecond = 40
	seesReachFt      = 200.0
)

// usingUp is a status that an ability's use will spend once its effects have landed.
type usingUp struct {
	key  statusKey
	held *activeStatus
}

// seen is a character as someone coming across it should see it, with what it holds.
func (l *Layer) seen(c Character) Character {
	v := l.unit(c.ID, "")
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
func (l *Layer) tellOf(id int64, b []byte) {
	u := l.unit(id, "")
	switch {
	case u == nil:
	case u.player != nil:
		l.tell(u.player, b)
	default:
		l.tellContinent(u.char.Continent, b)
	}
}

// tell sends a message to a player and those near it.
func (l *Layer) tell(p *Player, b []byte) {
	p.send(b)
	for _, o := range l.near(p) {
		o.send(b)
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
		l.combat.tick(now)
		l.showResting(now)
		gone := l.leavings(now)
		l.mu.Unlock()
		for _, p := range gone {
			h.remove(p, true)
		}
	}
}

func (cm *Combat) tick(now time.Time) {
	dt := 0.0
	if !cm.lastTick.IsZero() {
		dt = now.Sub(cm.lastTick).Seconds()
	}
	cm.lastTick = now
	for u := range cm.state.playerUnits() {
		f := u.fight
		if c := f.cast; c != nil {
			if !c.released && !now.Before(c.release) {
				cm.release(u, c, now)
			} else if c.released && !now.Before(c.ends) {
				f.cast = nil
			}
		}
		cm.swing(u, now)
		cm.spar(u, now)
		cm.regen(u, dt, now)
	}
	// Landings can add landings, so go by index.
	var later []*landing
	for i := 0; i < len(cm.landings); i++ {
		a := cm.landings[i]
		if a.cast != nil && a.cast.stopped {
			continue
		}
		if now.Before(a.at) {
			later = append(later, a)
			continue
		}
		a.run(now)
	}
	cm.landings = later
	for _, d := range cm.state.mobList() {
		if !d.lastHit.IsZero() && now.Sub(d.lastHit) >= dummyResetIdle {
			d.firstHit, d.lastHit, d.damage = time.Time{}, time.Time{}, 0
		}
	}
	cm.sweep(now)
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
