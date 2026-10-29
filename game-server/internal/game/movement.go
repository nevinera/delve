package game

import (
	"fmt"
	"math"
	"time"
)

// Movement checks: each report a client sends has to follow from the one before, at the speeds a
// character can move, by the clocks of both. None of this needs the world's ground, so it can't
// tell walking uphill from floating, only that a character rose or fell further than it could.

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

// Leeway for what a client reports, for timing between its frames and its reports.
const (
	speedLeeway  = 1.15 // on top of the speed it's moving at
	slackFt      = 4.0  // on top of any distance
	slopeRise    = 1.5  // feet up or down a foot across, walking up or down the steepest ground
	clockAhead   = 0.5  // seconds a client's clock can run ahead of the server's
	calibrate    = 5.0  // seconds after entering that the client's clock is measured against the server's
	airAfterJump = 1.5  // seconds after a jump that a character can still be rising
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

	descending bool
	peak       [3]float64 // where a descent started
	peakT      float64
	lastFall   *Fall

	correcting  bool // waiting for the client to take a correction
	correctedAt time.Time
	corrections []time.Time
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
// `from` (where the server last had it).
func (m *motion) check(r incoming, from [3]float64, now time.Time) (verdict, string) {
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
		// The ground under the character is the client's to know: take its height.
		m.at[1], m.peak[1] = r.At[1], r.At[1]
		return m.take(r, t), ""
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
	return m.take(r, t), ""
}

// take keeps a report that passed, and follows its falls.
func (m *motion) take(r incoming, t float64) verdict {
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
