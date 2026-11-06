package bot

import (
	"math"

	"github.com/delve-mmo/delve3d/game-server/internal/game"
	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

// Ground is the ground the bot walks on (worlds.Ground).
type Ground interface {
	At(x, z float64) (worlds.Sample, bool, error)
	Enters(from, to [3]float64) (string, error)
}

const (
	runFt  = 21.0
	swimFt = 14.2
	// maxClimb is the rise over run the bot walks up, a little under what the server allows.
	maxClimb = 1.2
	// stepFt is how far up the bot steps onto a slab, as the walker does.
	stepFt = 2.5
)

// heartbeat is how often the bot reports where it is between moves, in seconds.
var heartbeat = map[bool]float64{true: 0.5, false: 1.0}

// Controls is how the bot moves, and where that takes it. The bot works out its own position from
// its movement, as the browser's walker does, and reports it: a move when the movement changes, and
// heartbeats between (client/src/play/game.js). The server checks the reports add up, and puts the
// bot back when they don't. Given the ground, it keeps to it as the walker does: on the ground or
// slabs, swimming in deep water, not up slopes too steep to walk, and not into what's in its way.
// Yaw is radians, 0 facing +z (south); x is east.
type Controls struct {
	At      [3]float64
	Yaw     float64
	Forward int
	Ground  Ground // nil walks through everything, keeping its height

	send       func(any)
	goal       *goal
	swimming   bool
	sentMove   *game.Move
	sentAt     float64
	quit       bool
	quitReason string
}

type goal struct {
	x, z, stopWithin float64
	y                *float64
}

func NewControls(send func(any)) *Controls { return &Controls{send: send} }

// Adopt takes where the server put the bot, on entering or when it moves the bot, and reports
// afresh from there. It settles onto what's there to stand on, as the walker would, swimming if
// that's in water too deep to stand in.
func (c *Controls) Adopt(at [3]float64, yaw float64) {
	c.At, c.Yaw, c.sentMove, c.swimming = at, yaw, nil, false
	if c.Ground == nil {
		return
	}
	if s, ok, err := c.Ground.At(at[0], at[2]); ok && err == nil {
		if height, swimming, ok := s.Stand(at[1], stepFt); ok {
			c.At[1], c.swimming = height, swimming
		}
	}
}

// MoveToward walks straight to continent feet (x, z), stopping within stopWithin feet. No pathing:
// on the ground, a slope too steep to walk stops it. Without the ground, nothing stops it, and it
// keeps its height unless given one, which it climbs or drops toward no faster than it moves
// across.
func (c *Controls) MoveToward(x, z, stopWithin float64, y *float64) {
	c.goal = &goal{x: x, z: z, stopWithin: stopWithin, y: y}
}

func (c *Controls) Stop() {
	c.goal = nil
	c.Forward = 0
}

// Quit ends the run, saying why when there's a reason worth logging.
func (c *Controls) Quit(reason string) { c.quit, c.quitReason = true, reason }

func (c *Controls) Quitting() (bool, string) { return c.quit, c.quitReason }

// Advance moves the bot on by dt seconds: toward its goal, if it has one, or straight on as it's
// going.
func (c *Controls) Advance(dt float64) {
	speed := runFt
	if c.swimming {
		speed = swimFt
	}
	step := speed * dt * float64(c.Forward)
	if g := c.goal; g != nil {
		dx, dz := g.x-c.At[0], g.z-c.At[2]
		left := math.Hypot(dx, dz) - g.stopWithin
		if left <= 0 {
			c.Stop()
			return
		}
		c.Yaw = math.Atan2(dx, dz)
		c.Forward = 1
		step = min(speed*dt, left)
		if g.y != nil && c.Ground == nil {
			c.At[1] += max(-step, min(step, *g.y-c.At[1]))
		}
	}
	if step == 0 {
		return
	}
	x, z := c.At[0]+math.Sin(c.Yaw)*step, c.At[2]+math.Cos(c.Yaw)*step
	if c.Ground == nil {
		c.At[0], c.At[2] = x, z
		return
	}
	c.stepOnto(x, z, step)
}

// stepOnto steps onto what's at (x, z) to stand on, unless there's nothing, it's too steep to
// climb or goes up onto ground whose face is, or something's in the way.
func (c *Controls) stepOnto(x, z, step float64) {
	if into, err := c.Ground.Enters(c.At, [3]float64{x, c.At[1], z}); err != nil || into != "" {
		c.Stop()
		return
	}
	s, ok, err := c.Ground.At(x, z)
	if err != nil || !ok {
		c.Stop()
		return
	}
	height, swimming, ok := s.Stand(c.At[1], stepFt)
	rise := height - c.At[1]
	// Nor up onto ground whose face is too steep, however gently the step climbs it.
	onSteep := !swimming && s.SlopeOf(height) > maxClimb
	if !ok || (!swimming && !c.swimming && (rise > maxClimb*step || (rise > 0 && onSteep))) {
		c.Stop()
		return
	}
	c.At = [3]float64{x, height, z}
	c.swimming = swimming
}

// Report sends a move when the movement has changed since the last one, or when it's never sent
// one, and a heartbeat when one's due. now is in seconds.
func (c *Controls) Report(now float64) {
	mv := game.Move{Forward: c.Forward, Gait: "run", Swim: c.swimming}
	switch {
	case c.sentMove == nil || *c.sentMove != mv:
		c.send(move{Type: "move", T: now * 1000, At: c.At, Yaw: c.Yaw, Move: &mv})
		c.sentMove, c.sentAt = &mv, now
	case now-c.sentAt >= heartbeat[c.Forward != 0]:
		c.send(move{Type: "heartbeat", T: now * 1000, At: c.At, Yaw: c.Yaw})
		c.sentAt = now
	}
}
