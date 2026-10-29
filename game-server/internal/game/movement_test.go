package game

import (
	"math"
	"strings"
	"testing"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

// reporter sends motion reports as a client would, keeping the client's clock and the server's
// in step unless told otherwise.
type reporter struct {
	t     *testing.T
	m     *motion
	start time.Time
	s     float64 // seconds since the start, by the server's clock
	t0    float64 // the client's clock at the start, in ms
	ahead float64 // seconds the client's clock is ahead of the server's
	at    [3]float64
	g     Ground // nil: the ground isn't known
}

func newReporter(t *testing.T) *reporter {
	start := time.Unix(1_800_000_000, 0)
	return &reporter{t: t, m: &motion{joined: start}, start: start, t0: 5000, at: [3]float64{100, 50, 100}}
}

// report sends a report after dt seconds, from the character at (x, y, z), moving as mv says
// (nil for a heartbeat).
func (r *reporter) report(dt float64, x, y, z float64, mv *Move) (verdict, string) {
	r.s += dt
	msg := incoming{Type: "move", T: r.t0 + (r.s+r.ahead)*1000, At: [3]float64{x, y, z}, Move: mv}
	if mv == nil {
		msg.Type = "heartbeat"
	}
	v, why := r.m.check(msg, r.at, r.start.Add(time.Duration(r.s*float64(time.Second))), r.g)
	if v == accept {
		r.at = msg.At
	}
	return v, why
}

func (r *reporter) want(want verdict, dt, x, y, z float64, mv *Move) string {
	r.t.Helper()
	v, why := r.report(dt, x, y, z, mv)
	if v != want {
		r.t.Fatalf("report at %v after %vs = %v (%s), want %v", [3]float64{x, y, z}, dt, v, why, want)
	}
	return why
}

var (
	running  = &Move{Forward: 1, Gait: "run"}
	walking  = &Move{Forward: 1, Gait: "walk"}
	sprints  = &Move{Forward: 1, Gait: "sprint"}
	swimming = &Move{Forward: 1, Gait: "run", Swim: true}
	still    = &Move{Gait: "run"}
	jump     = &Move{Forward: 1, Gait: "run", Jump: true}
)

func TestRunningAtSpeedIsFine(t *testing.T) {
	r := newReporter(t)
	r.want(accept, 0.1, 100, 50, 100, running)
	for i := 1; i <= 20; i++ {
		r.want(accept, 0.5, 100+float64(i)*10.5, 50, 100, nil)
	}
	r.want(accept, 0.5, 310, 50, 100, still)
	r.want(accept, 5, 310, 50, 100, nil)
}

func TestTooFast(t *testing.T) {
	cases := []struct {
		name string
		mv   *Move
		ft   float64 // across, in a second
		ok   bool
	}{
		{"running", running, 21, true},
		{"running too fast", running, 30, false},
		{"walking at a run", walking, 21, false},
		{"walking", walking, 7.5, true},
		{"sprinting", sprints, 42, true},
		{"swimming at a run", swimming, 21, false},
		{"standing still, moving", still, 10, false},
		{"backing up at a run", &Move{Forward: -1, Gait: "run"}, 21, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := newReporter(t)
			r.want(accept, 0.1, 100, 50, 100, c.mv)
			want := correct
			if c.ok {
				want = accept
			}
			r.want(want, 1, 100+c.ft, 50, 100, nil)
		})
	}
}

func TestTeleporting(t *testing.T) {
	r := newReporter(t)
	r.want(accept, 0.1, 100, 50, 100, running)
	if why := r.want(correct, 0.5, 600, 50, 100, nil); !strings.Contains(why, "moved 500 ft") {
		t.Errorf("why = %q", why)
	}
	// Reports sent before the client took the correction are let go, then it goes on from there.
	r.want(ignore, 0.1, 610, 50, 100, nil)
	r.want(accept, 0.3, 105, 50, 100, nil)
	r.want(accept, 0.5, 115, 50, 100, nil)
}

func TestFirstReportStartsWhereItEntered(t *testing.T) {
	r := newReporter(t)
	r.want(correct, 0.1, 300, 50, 100, running)

	// A moment in, it may have moved a little; the client says how high the ground is.
	r = newReporter(t)
	r.want(accept, 0.2, 108, 12, 100, running)
	if r.m.at[1] != 12 {
		t.Errorf("height = %v", r.m.at[1])
	}
}

func TestClockRunningAhead(t *testing.T) {
	r := newReporter(t)
	r.want(accept, 0.1, 100, 50, 100, running)
	r.want(accept, 1, 121, 50, 100, nil)
	// A report that's late arriving is from earlier, by the client's clock.
	r.ahead = -0.3
	r.want(accept, 1, 135.7, 50, 100, nil)
	r.ahead = 0
	for i := 0; i < 6; i++ {
		r.want(accept, 1, 142+21*float64(i+1), 50, 100, nil)
	}
	// Then a client whose clock runs fast gets more time to move in than the server gave it.
	r.ahead = 2
	if why := r.want(correct, 1, 142+21*7+42, 50, 100, nil); !strings.Contains(why, "clock ran 2.0 s ahead") {
		t.Errorf("why = %q", why)
	}
}

func TestClockGoingBackward(t *testing.T) {
	r := newReporter(t)
	r.want(accept, 0.1, 100, 50, 100, running)
	r.ahead = -1
	if why := r.want(correct, 0.5, 100, 50, 100, nil); why != "clock went backward" {
		t.Errorf("why = %q", why)
	}
}

func TestRising(t *testing.T) {
	r := newReporter(t)
	r.want(accept, 0.1, 100, 50, 100, still)
	// Standing still, it can't rise more than the slack, but a jump takes it higher.
	r.want(accept, 0.5, 100, 53, 100, nil)
	r.want(correct, 0.5, 100, 60, 100, nil)

	r = newReporter(t)
	r.want(accept, 0.1, 100, 50, 100, still)
	r.want(accept, 0.1, 100, 50, 100, &Move{Gait: "run", Jump: true})
	r.want(accept, 0.3, 100, 56, 100, nil)

	// Running uphill rises with the ground.
	r = newReporter(t)
	r.want(accept, 0.1, 100, 50, 100, running)
	r.want(accept, 0.5, 110, 60, 100, nil)
	r.want(correct, 0.5, 120, 90, 100, nil)
}

func TestFalling(t *testing.T) {
	r := newReporter(t)
	r.want(accept, 0.1, 100, 300, 100, still)
	// Off a cliff: down as fast as gravity takes it, and no faster.
	r.want(accept, 0.5, 100, 300-6, 100, nil)
	r.want(accept, 0.5, 100, 300-24, 100, nil)
	r.want(accept, 0.5, 100, 300-54, 100, nil)
	r.want(accept, 0.5, 100, 300-96, 100, nil)
	r.want(correct, 0.5, 100, 0, 100, nil)

	r = newReporter(t)
	r.want(accept, 0.1, 100, 300, 100, still)
	r.want(accept, 0.5, 100, 294, 100, nil)
	r.want(accept, 0.5, 100, 276, 100, nil)
	r.want(accept, 0.5, 100, 250, 100, nil)
	r.want(accept, 0.5, 100, 250, 100, nil) // landed
	if f := r.m.lastFall; f == nil || f.Ft != 50 || f.S != 1.5 {
		t.Errorf("fall = %+v", f)
	}
}

func TestTooManyCorrectionsDrops(t *testing.T) {
	r := newReporter(t)
	r.want(accept, 0.1, 100, 50, 100, still)
	for i := 0; i < maxCorrections; i++ {
		r.want(correct, 3, 1000, 50, 100, nil)
	}
	r.want(drop, 3, 1000, 50, 100, nil)
}

func TestHubCorrectsAndDoesntPassItOn(t *testing.T) {
	h := NewHub(&fakeWorlds{}, characters(nil))
	c := clockOf(h)
	a := enter(t, h, 1)
	next(t, a)
	next(t, a)
	b := enter(t, h, 2)
	next(t, b)
	next(t, b)
	next(t, a) // b appears
	*c += 0.5
	if err := b.Handle([]byte(`{"type":"move","t":1500,"at":[5376,0,5376],"yaw":0,"move":{"forward":1,"gait":"run"}}`)); err != nil {
		t.Fatal(err)
	}
	next(t, a)
	*c += 0.5
	if err := b.Handle([]byte(`{"type":"heartbeat","t":2000,"at":[5876,0,5376],"yaw":0}`)); err != nil {
		t.Fatal(err)
	}
	if m := next(t, b); m["type"] != "correct" || m["at"].([]any)[0] != 5376.0 {
		t.Fatalf("b got %v", m)
	}
	quiet(t, a)
	if b.state.At[0] != 5376 {
		t.Errorf("b is at %v", b.state.At)
	}
}

// groundOf is ground worked out from where you are: its height, and the water's (NaN for none).
type groundOf func(x, z float64) (ground, water float64)

func (f groundOf) At(x, z float64) (worlds.Sample, bool, error) {
	if x < 0 {
		return worlds.Sample{}, false, nil // off the land
	}
	g, w := f(x, z)
	return worlds.Sample{Ground: g, Water: w}, true, nil
}

func (f groundOf) Enters(from, to [3]float64) (bool, error) { return false, nil }

// slabbed is level ground at 50 with a floor over it, its top at 60, from x = 100 to 200, and a
// wall standing across x = 300.
type slabbed struct{}

func (slabbed) At(x, z float64) (worlds.Sample, bool, error) {
	s := worlds.Sample{Ground: 50, Water: math.NaN()}
	if x >= 100 && x <= 200 {
		s.Footholds = []float64{60}
	}
	return s, true, nil
}

func (slabbed) Enters(from, to [3]float64) (bool, error) {
	return (from[0] < 300) != (to[0] < 300) && math.Min(from[1], to[1]) < 70, nil
}

var (
	level = groundOf(func(x, z float64) (float64, float64) { return 50, math.NaN() })
	// A cliff: 300 ft up west of x = 200, 50 ft below it.
	cliff = groundOf(func(x, z float64) (float64, float64) {
		if x < 200 {
			return 300, math.NaN()
		}
		return 50, math.NaN()
	})
	// A lake 15 ft deep east of x = 300, with dry ground at 50 west of it.
	lake = groundOf(func(x, z float64) (float64, float64) {
		if x < 300 {
			return 50, math.NaN()
		}
		return 40, 55
	})
)

func onGround(t *testing.T, g Ground, y float64) *reporter {
	r := newReporter(t)
	r.g, r.at[1] = g, y
	return r
}

func TestUnderTheGround(t *testing.T) {
	r := onGround(t, level, 50)
	r.want(accept, 0.1, 100, 50, 100, still)
	r.want(accept, 0.5, 100, 48.5, 100, nil)
	if why := r.want(correct, 0.5, 100, 45, 100, nil); !strings.Contains(why, "5 ft under the ground") {
		t.Errorf("why = %q", why)
	}
}

func TestOffTheLand(t *testing.T) {
	r := onGround(t, level, 50)
	r.at[0] = 5
	r.want(accept, 0.1, 5, 50, 100, running)
	if why := r.want(correct, 0.5, -5, 50, 100, nil); why != "went off the land" {
		t.Errorf("why = %q", why)
	}
}

func TestFloating(t *testing.T) {
	r := onGround(t, level, 50)
	r.want(accept, 0.1, 100, 50, 100, still)
	r.want(accept, 0.1, 100, 50, 100, &Move{Gait: "run", Jump: true})
	// It jumps, and stays up: a moment past the jump, it has to be coming down.
	r.want(accept, 0.3, 100, 55, 100, nil)
	for i := 0; i < 3; i++ {
		r.want(accept, 0.5, 100, 55, 100, nil)
	}
	if why := r.want(correct, 0.5, 100, 55, 100, nil); !strings.Contains(why, "floated 5 ft over the ground") {
		t.Errorf("why = %q", why)
	}
}

func TestOffACliff(t *testing.T) {
	r := onGround(t, cliff, 300)
	r.at[0] = 190
	r.want(accept, 0.1, 190, 300, 100, running)
	r.want(accept, 0.5, 200.5, 300, 100, nil)
	// Off the edge it falls as gravity takes it, and lands.
	y := 300.0
	for i := 1; i <= 7; i++ {
		y = math.Max(50, 300-gravity*math.Pow(0.5*float64(i), 2)/2)
		r.want(accept, 0.5, 200.5+10.5*float64(i), y, 100, nil)
	}
	if y != 50 {
		t.Fatalf("hasn't landed: %v", y)
	}
	r.want(accept, 0.5, 200.5+10.5*8, 50, 100, nil)
	if f := r.m.lastFall; f == nil || f.Ft != 250 {
		t.Errorf("fall = %+v", f)
	}
}

func TestWater(t *testing.T) {
	// Swimming, the feet are 4.5 ft under the surface.
	r := onGround(t, lake, 50)
	r.want(accept, 0.1, 100, 50, 100, running)
	r.want(accept, 0.5, 110.5, 50, 100, nil)
	r = onGround(t, lake, 50.5)
	r.at[0] = 310
	r.want(accept, 0.1, 310, 50.5, 100, swimming)
	r.want(accept, 0.5, 317, 50.5, 100, nil)

	// Standing on the surface isn't.
	r = onGround(t, lake, 55)
	r.at[0] = 310
	r.want(accept, 0.1, 310, 55, 100, still)
	r.want(accept, 0.5, 310, 55, 100, nil)
	if why := r.want(correct, 0.5, 310, 55, 100, nil); why != "walked on water" {
		t.Errorf("why = %q", why)
	}

	// Nor is swimming on dry land.
	r = onGround(t, lake, 50)
	if why := r.want(correct, 0.1, 100, 50, 100, swimming); why != "swam where there's no deep water" {
		t.Errorf("why = %q", why)
	}
}

func TestTooSteep(t *testing.T) {
	// Ground rising 1.76 ft a foot east: within what the checks without ground allow, but steeper
	// than walking climbs.
	hill := groundOf(func(x, z float64) (float64, float64) { return 50 + 1.76*(x-100), math.NaN() })
	r := onGround(t, hill, 50)
	r.want(accept, 0.1, 100, 50, 100, running)
	if why := r.want(correct, 0.5, 110.5, 50+1.76*10.5, 100, nil); !strings.Contains(why, "steeper than you can walk") {
		t.Errorf("why = %q", why)
	}
	// 1.2 is fine.
	hill = groundOf(func(x, z float64) (float64, float64) { return 50 + 1.2*(x-100), math.NaN() })
	r = onGround(t, hill, 50)
	r.want(accept, 0.1, 100, 50, 100, running)
	r.want(accept, 0.5, 110.5, 50+1.2*10.5, 100, nil)
}

func TestSlabsHoldYouUp(t *testing.T) {
	r := onGround(t, slabbed{}, 60)
	r.at[0] = 150
	r.want(accept, 0.1, 150, 60, 100, still)
	for i := 0; i < 6; i++ {
		r.want(accept, 0.5, 150, 60, 100, nil) // on the floor
	}
	// Off its edge, back on the ground.
	r.want(accept, 0.1, 150, 60, 100, running)
	for x := 160.0; x <= 200; x += 10 {
		r.want(accept, 0.5, x, 60, 100, nil)
	}
	y := 60.0
	for i := 1; y > 50; i++ {
		y = math.Max(50, 60-gravity*math.Pow(0.5*float64(i), 2)/2)
		r.want(accept, 0.5, 200+10*float64(i), y, 100, nil)
	}
}

func TestFloatingOverASlab(t *testing.T) {
	r := onGround(t, slabbed{}, 60)
	r.at[0] = 150
	r.want(accept, 0.1, 150, 60, 100, still)
	r.want(accept, 0.1, 150, 60, 100, &Move{Gait: "run", Jump: true})
	r.want(accept, 0.3, 150, 65, 100, nil)
	for i := 0; i < 3; i++ {
		r.want(accept, 0.5, 150, 65, 100, nil)
	}
	if why := r.want(correct, 0.5, 150, 65, 100, nil); !strings.Contains(why, "floated 5 ft") {
		t.Errorf("why = %q", why)
	}
}

func TestWalkingIntoASlab(t *testing.T) {
	r := onGround(t, slabbed{}, 50)
	r.at[0] = 290
	r.want(accept, 0.1, 290, 50, 100, running)
	r.want(accept, 0.4, 298, 50, 100, nil)
	if why := r.want(correct, 0.2, 302, 50, 100, nil); why != "walked into a slab" {
		t.Errorf("why = %q", why)
	}
}
