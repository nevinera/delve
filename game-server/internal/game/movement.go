package game

import (
	"fmt"
	"log"
	"math"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

// Movement checks: each report a client sends has to follow from the one before, at the speeds a
// character can move, by the clocks of both. Where the world's ground is known, the character also
// has to keep to it: not under it, not floating over it or over deep water, not swimming out of
// water, and not up slopes too steep to climb. Slabs are ground too, to stand on, and it can't
// move into one.

// Speeds and jumping, feet and seconds, as client/src/editor/walker.js moves characters.
const (
	runFt   = 21.0
	walkFt  = 7.5
	backFt  = 13.5 // backing up at a run
	swimFt  = 14.2
	sprint  = 2.0
	jumpFt  = 16.0 // upward speed at takeoff
	gravity = 48.0
)

// The ground, as client/src/editor/walker.js keeps to it.
const (
	maxClimb  = worlds.MaxClimb // rise over run of the steepest ground a character walks up
	swimDepth = 4.5             // how far below the water's surface a swimming character's feet are
)

// Leeway for what a client reports, for timing between its frames and its reports.
const (
	speedLeeway  = 1.15 // on top of the speed it's moving at
	slackFt      = 4.0  // on top of any distance
	slopeRise    = 1.5  // feet up or down a foot across, walking up or down the steepest ground
	clockAhead   = 0.5  // seconds a client's clock can run ahead of the server's
	calibrate    = 5.0  // seconds after entering that the client's clock is measured against the server's
	airAfterJump = 1.5  // seconds after a jump that a character can still be rising
	underFt      = 2.0  // how far below the ground the feet can be
	aloftGrace   = 0.5  // seconds off the ground before it has to be falling
)

// A client corrected more than maxCorrections times in correctionWindow is dropped.
const (
	maxCorrections   = 10
	correctionWindow = time.Minute
	correctWait      = 2 * time.Second // how long to wait for a client to take a correction
)

// jumpRise is how high a jump goes.
var jumpRise = jumpFt * jumpFt / (2 * gravity)

// Fall is a fall that ended: how far down from where it started, and how long it took.
type Fall struct {
	Ft float64
	S  float64
}

// motion is what a player's movement checks remember: the last report they took, and the clocks.
type motion struct {
	joined  time.Time // when the character entered
	started bool
	at      [3]float64 // where the last report it took put the character
	t       float64    // that report's client time, in seconds
	move    Move       // how the character was moving since then

	entered time.Time // when the first report came
	lag     float64   // server time less client time, the least seen while calibrating
	jumped  float64   // client time of the last jump, or -inf

	// Where the last report it took stood, and since when it's been off the ground without a jump.
	footing footing
	aloft   bool
	aloftT  float64 // client time it left the ground
	aloftY  float64 // and how high it was then

	descending bool
	peak       [3]float64 // where a descent started
	peakT      float64
	lastFall   *Fall

	correcting  bool // waiting for the client to take a correction
	correctedAt time.Time
	corrections []time.Time
}

// footing is how a report stood on the ground.
type footing struct {
	known  bool    // the ground was known there
	ground float64 // the ground's height
	stand  float64 // where the feet rest: the ground, a swimming depth in deep water, or a slab
	slab   bool    // they rest on a slab
	deep   bool    // water too deep to stand in
	on     bool    // the feet were where they rest
}

// Ground is the ground of the continent a character is on (worlds.Ground).
type Ground interface {
	At(x, z float64) (worlds.Sample, bool, error)
	Enters(from, to [3]float64) (bool, error)
}

// verdict is what to do with a report.
type verdict int

const (
	accept  verdict = iota
	ignore          // a report sent before the client took a correction
	correct         // put the character back where it was
	drop            // too many corrections
)

// check decides what to do with a report that came at server time now, from a character at
// `from` (where the server last had it), on ground g (nil where it isn't known).
func (m *motion) check(r incoming, from [3]float64, now time.Time, g Ground) (verdict, string) {
	t := r.T / 1000
	if r.T == 0 {
		t = secondsOf(now) // a client that doesn't send its time is timed by the server's clock
	}
	if !m.started {
		m.started, m.entered, m.lag, m.jumped = true, now, secondsOf(now)-t, math.Inf(-1)
		m.at, m.t = from, t
		m.peak, m.peakT = from, t
		// Before its first report, the client may have started moving, as fast as anyone can.
		allowed := slackFt + runFt*sprint*now.Sub(m.joined).Seconds()*speedLeeway
		if moved := horizontal(from, r.At); moved > allowed {
			return m.violation(now, fmt.Sprintf("first report is %.0f ft from where you entered", moved))
		}
		// Without the ground, the height is the client's to know: take it.
		m.at[1], m.peak[1] = r.At[1], r.At[1]
		f, why := m.onGround(r, t, g)
		if why != "" {
			return m.violation(now, why)
		}
		return m.take(r, t, f), ""
	}

	if m.correcting {
		// Reports sent before the client took the correction don't count against it.
		if horizontal(m.at, r.At) > slackFt+m.speed(r)*math.Max(0, t-m.t) {
			if now.Sub(m.correctedAt) < correctWait {
				return ignore, ""
			}
			return m.violation(now, "didn't take a correction")
		}
		m.correcting = false
	}

	lag := secondsOf(now) - t
	if now.Sub(m.entered).Seconds() < calibrate {
		m.lag = math.Min(m.lag, lag)
	} else if lag < m.lag-clockAhead {
		why := fmt.Sprintf("clock ran %.1f s ahead of the server's", m.lag-lag)
		m.lag = lag // so one jump ahead is one correction, not one a report
		return m.violation(now, why)
	}
	dt := t - m.t
	if dt < 0 {
		return m.violation(now, "clock went backward")
	}

	across := horizontal(m.at, r.At)
	if allowed := m.speed(r)*dt*speedLeeway + slackFt; across > allowed {
		return m.violation(now, fmt.Sprintf("moved %.0f ft in %.2f s, more than %.0f ft", across, dt, allowed))
	}

	rise := r.At[1] - m.at[1]
	jumping := r.Move != nil && r.Move.Jump
	airborne := t-m.jumped < airAfterJump
	if rise > 0 {
		allowed := across*slopeRise + slackFt
		if airborne || jumping {
			allowed += jumpRise
		}
		if rise > allowed {
			return m.violation(now, fmt.Sprintf("rose %.0f ft without jumping that high", rise))
		}
	} else if rise < 0 {
		// Falling, it can't go down faster than gravity takes it, unless it's walking down a slope.
		start := m.t
		if m.descending {
			start = m.peakT
		}
		v := gravity * (m.t - start)
		allowed := v*dt + gravity*dt*dt/2 + across*slopeRise + slackFt
		if -rise > allowed {
			return m.violation(now, fmt.Sprintf("fell %.0f ft in %.2f s, faster than falling", -rise, dt))
		}
	}
	if why := m.intoSlab(r, g); why != "" {
		return m.violation(now, why)
	}
	f, why := m.onGround(r, t, g)
	if why != "" {
		return m.violation(now, why)
	}
	return m.take(r, t, f), ""
}

// intoSlab checks a report's move from the last one doesn't run into a slab.
func (m *motion) intoSlab(r incoming, g Ground) string {
	if g == nil {
		return ""
	}
	into, err := g.Enters(m.at, r.At)
	if err != nil {
		log.Printf("movement: reading the slabs: %v", err)
		return ""
	}
	if into {
		return "walked into a slab"
	}
	return ""
}

// onGround checks a report against the ground, and says how it stood.
func (m *motion) onGround(r incoming, t float64, g Ground) (footing, string) {
	if g == nil {
		return footing{}, ""
	}
	s, ok, err := g.At(r.At[0], r.At[2])
	if err != nil {
		log.Printf("movement: reading the ground: %v", err)
		return footing{}, ""
	}
	if !ok {
		return footing{}, "went off the land"
	}
	f := footing{known: true, ground: s.Ground, stand: s.Ground}
	f.deep = !math.IsNaN(s.Water) && s.Water-swimDepth > s.Ground
	if f.deep {
		f.stand = s.Water - swimDepth
	}
	y := r.At[1]
	// The highest slab within reach of the feet holds them, when it's over the ground or they're
	// under it.
	best := math.Inf(-1)
	for _, top := range s.Footholds {
		if top <= y+slackFt {
			best = math.Max(best, top)
		}
	}
	if best > f.stand || (!math.IsInf(best, -1) && y < s.Ground-underFt) {
		f.stand, f.slab, f.deep = best, true, false
	}
	f.on = y <= f.stand+slackFt
	jumping := (r.Move != nil && r.Move.Jump) || t-m.jumped < airAfterJump
	swimming := m.move.Swim
	if r.Move != nil {
		swimming = r.Move.Swim
	}
	last := m.footing

	if y < s.Ground-underFt && !f.slab {
		return f, fmt.Sprintf("went %.0f ft under the ground", s.Ground-y)
	}
	if swimming && !f.deep && !(last.known && last.deep) {
		return f, "swam where there's no deep water"
	}
	// Off the ground without a jump, it has to be falling: from where it left the ground, as far
	// as it would have fallen from standing still, after a moment's grace.
	if !f.on && !jumping {
		t0, y0 := m.aloftT, m.aloftY
		if !m.aloft {
			t0, y0 = m.t, math.Max(m.at[1], y)
		}
		fall := math.Max(0, t-t0-aloftGrace)
		if y > y0-gravity*fall*fall/2+slackFt && fall > 0 {
			if f.deep {
				return f, "walked on water"
			}
			return f, fmt.Sprintf("floated %.0f ft over the ground", y-f.stand)
		}
	}
	// Walking, from ground to ground, it can't climb more steeply than the walker lets it.
	if last.known && last.on && f.on && !f.deep && !last.deep && !jumping {
		across := horizontal(m.at, r.At)
		climb := f.ground - last.ground
		if f.slab || last.slab {
			climb = f.stand - last.stand
		}
		if climb > maxClimb*across*1.25+underFt {
			return f, fmt.Sprintf("climbed %.0f ft in %.0f ft, steeper than you can walk", climb, across)
		}
	}
	return f, ""
}

// take keeps a report that passed, and follows its falls and footing.
func (m *motion) take(r incoming, t float64, f footing) verdict {
	jumping := (r.Move != nil && r.Move.Jump) || t-m.jumped < airAfterJump
	switch {
	case !f.known || f.on || jumping:
		m.aloft = false
	case !m.aloft:
		m.aloft, m.aloftT, m.aloftY = true, m.t, math.Max(m.at[1], r.At[1])
	}
	m.footing = f
	if r.At[1] < m.at[1]-0.5 {
		if !m.descending {
			m.descending, m.peak, m.peakT = true, m.at, m.t
		}
	} else if m.descending {
		m.descending = false
		// It landed by the last report that was still going down.
		m.lastFall = &Fall{Ft: m.peak[1] - r.At[1], S: m.t - m.peakT}
	}
	if r.Move != nil {
		if r.Move.Jump {
			m.jumped = t
		}
		m.move = r.Move.clean()
	}
	m.at, m.t = r.At, t
	return accept
}

// violation counts a correction, or drops the client when there have been too many.
func (m *motion) violation(now time.Time, why string) (verdict, string) {
	recent := m.corrections[:0]
	for _, at := range m.corrections {
		if now.Sub(at) < correctionWindow {
			recent = append(recent, at)
		}
	}
	m.corrections = append(recent, now)
	m.correcting, m.correctedAt = true, now
	if len(m.corrections) > maxCorrections {
		return drop, why
	}
	return correct, why
}

// speed is the fastest the character could have moved since the last report: as it was moving
// then, or as the report says it moves now.
func (m *motion) speed(r incoming) float64 {
	s := speedOf(m.move)
	if r.Move != nil {
		s = math.Max(s, speedOf(r.Move.clean()))
	}
	return s
}

// speedOf is how fast a character moving this way goes across the ground.
func speedOf(mv Move) float64 {
	if mv.Forward == 0 && mv.Strafe == 0 {
		return 0
	}
	if mv.Swim {
		return swimFt
	}
	if mv.Gait == "walk" {
		return walkFt
	}
	s := runFt
	if mv.Forward < 0 {
		s = backFt
	}
	if mv.Gait == "sprint" {
		s *= sprint
	}
	return s
}

func secondsOf(t time.Time) float64 { return float64(t.UnixNano()) / 1e9 }

func horizontal(a, b [3]float64) float64 { return math.Hypot(b[0]-a[0], b[2]-a[2]) }
