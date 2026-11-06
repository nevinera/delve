package bot

import (
	"sync/atomic"
	"time"
)

// tick is how often the strategy runs and the bot moves.
const tick = 100 * time.Millisecond

// Runner runs one bot on a connection to the game server: it keeps the State, ticks the strategy
// and reports the bot's movement, until the strategy quits, the server closes the connection, or
// the bot is told to stop. Then it stops moving and closes the connection, and the server saves
// where it was. Told to stop a second time, it doesn't wait for the close.
type Runner struct {
	Conn     Conn
	Strategy Strategy
	Log      *Log
	// Ground is a continent's ground, or nil for none.
	Ground func(continent string) Ground

	state    *State
	controls *Controls
	start    time.Time
	lastTick float64
	ticked   bool
	signals  atomic.Int32
}

// Interrupt asks the runner to stop; it's safe from another goroutine.
func (r *Runner) Interrupt() { r.signals.Add(1) }

func (r *Runner) Run() {
	r.start = time.Now()
	r.state = NewState()
	r.controls = NewControls(r.send)
	defer r.shutDown()
	for !r.done() {
		for _, m := range r.Conn.Read(tick / 2) {
			r.handle(m)
		}
		now := r.clock()
		if r.state.Entered() && (!r.ticked || now-r.lastTick >= tick.Seconds()) {
			r.tick(now)
		}
	}
}

func (r *Runner) clock() float64 { return time.Since(r.start).Seconds() }

func (r *Runner) send(v any) {
	if r.Log.Verbosity >= 1 {
		r.Log.Verbose("%s", encode(v))
	}
	r.Conn.Send(v)
}

func (r *Runner) tick(now float64) {
	dt := 0.0
	if r.ticked {
		dt = now - r.lastTick
	}
	r.Strategy.Tick(r.state, r.controls, now)
	r.controls.Advance(dt)
	r.controls.Report(now)
	r.lastTick, r.ticked = now, true
}

func (r *Runner) handle(m Message) {
	if m.Type == "moved" {
		r.Log.Debug("%s", m.Raw)
	} else {
		r.Log.Verbose("%s", m.Raw)
	}
	r.state.Apply(m)
	switch m.Type {
	case "error":
		r.Log.Warn("server: %s", m.Message)
	case "pickClass":
		if len(m.Classes) > 0 {
			r.Log.Info("Picking class %s", m.Classes[0])
			r.send(pick{Type: "pick", Class: m.Classes[0]})
		}
	case "welcome":
		me := r.state.Me
		r.arrive(me.Continent)
		r.Log.Info("Entered as %s, on %s at (%.0f, %.0f, %.0f)", me.Name, me.Continent, me.At[0], me.At[1], me.At[2])
	case "teleported":
		r.arrive(m.Continent)
		r.Log.Info("The server moved the bot to %s at (%.0f, %.0f, %.0f)", m.Continent, m.At[0], m.At[1], m.At[2])
	case "correct":
		if m.At != nil {
			r.controls.Adopt(*m.At, m.Yaw)
			r.Log.Warn("The server put the bot back at (%.0f, %.0f, %.0f)", m.At[0], m.At[1], m.At[2])
		}
	case "appear":
		if m.Character != nil {
			r.Log.Info("%s came near", m.Character.Name)
		}
	}
}

// arrive takes the bot's place and the ground from the state, on entering or being moved.
func (r *Runner) arrive(continent string) {
	if r.state.Me == nil {
		return
	}
	r.controls.Stop()
	r.controls.Ground = nil
	if r.Ground != nil {
		r.controls.Ground = r.Ground(continent)
	}
	r.controls.Adopt(r.state.Me.At, r.state.Me.Yaw)
}

func (r *Runner) done() bool {
	if r.signals.Load() > 0 {
		return true
	}
	if quit, why := r.controls.Quitting(); quit {
		if why != "" {
			r.Log.Info("The strategy quit: %s.", why)
		} else {
			r.Log.Info("The strategy quit.")
		}
		return true
	}
	if closed, why := r.Conn.Closed(); closed {
		r.Log.Info("The server closed the connection: %s", why)
		return true
	}
	return false
}

func (r *Runner) shutDown() {
	if closed, _ := r.Conn.Closed(); closed {
		return
	}
	r.Log.Info("Leaving...")
	if r.state.Entered() {
		r.controls.Stop()
		r.controls.Report(r.clock())
	}
	r.Conn.Close(2*time.Second, func() bool { return r.signals.Load() > 1 })
	r.Log.Info("Left.")
}
