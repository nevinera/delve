package bot

import (
	"math"
	"testing"

	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

type sent []move

func (s *sent) send(v any) {
	if m, ok := v.(move); ok {
		*s = append(*s, m)
	}
}

func (s sent) types() (types []string) {
	for _, m := range s {
		types = append(types, m.Type)
	}
	return types
}

func controlsAt(out *sent, at [3]float64, yaw float64, g Ground) *Controls {
	c := NewControls(out.send)
	c.Ground = g
	c.Adopt(at, yaw)
	return c
}

func near(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

func TestReportsAMoveThenHeartbeats(t *testing.T) {
	var out sent
	c := controlsAt(&out, [3]float64{0, 10, 0}, 0.5, nil)
	c.Report(0)
	c.Report(0.5)
	c.Report(1)
	if got := out.types(); len(got) != 2 || got[0] != "move" || got[1] != "heartbeat" {
		t.Fatalf("sent %v", got)
	}
	if m := out[0]; m.T != 0 || m.At != [3]float64{0, 10, 0} || m.Yaw != 0.5 || m.Move.Forward != 0 || m.Move.Gait != "run" {
		t.Errorf("first: %+v", m)
	}
	if out[1].T != 1000 || out[1].Move != nil {
		t.Errorf("heartbeat: %+v", out[1])
	}
}

func TestClimbsTowardAGoalsHeightNoFasterThanItMoves(t *testing.T) {
	var out sent
	c := controlsAt(&out, [3]float64{0, 10, 0}, 0, nil)
	y := 100.0
	c.MoveToward(0, 100, 0, &y)
	c.Advance(1)
	if c.At != [3]float64{0, 31, 21} {
		t.Errorf("at %v", c.At)
	}
}

func TestReportsAfreshFromWhereTheServerPutsIt(t *testing.T) {
	var out sent
	c := controlsAt(&out, [3]float64{0, 10, 0}, 0, nil)
	c.Report(0)
	c.Adopt([3]float64{5, 10, 5}, 1)
	c.Report(0.1)
	if got := out.types(); len(got) != 2 || got[1] != "move" || out[1].At != [3]float64{5, 10, 5} || out[1].Yaw != 1 {
		t.Errorf("sent %+v", out)
	}
}

func TestRunsToAGoalAndStops(t *testing.T) {
	var out sent
	c := controlsAt(&out, [3]float64{0, 10, 0}, 0, nil)
	y := 20.0
	c.MoveToward(0, 42, 0, &y)
	c.Advance(1)
	c.Report(0)
	if c.At != [3]float64{0, 20, 21} || out[len(out)-1].Move.Forward != 1 {
		t.Fatalf("at %v, sent %+v", c.At, out)
	}
	c.Report(0.5)
	if out[len(out)-1].Type != "heartbeat" {
		t.Errorf("no heartbeat at 0.5 s moving")
	}
	c.Advance(1)
	c.Advance(1)
	c.Report(1)
	if last := out[len(out)-1]; c.At != [3]float64{0, 20, 42} || last.Type != "move" || last.Move.Forward != 0 {
		t.Errorf("at %v, last %+v", c.At, last)
	}
}

func TestStopsShortOfAGoal(t *testing.T) {
	var out sent
	c := controlsAt(&out, [3]float64{0, 10, 0}, 0, nil)
	c.MoveToward(100, 0, 5, nil)
	for range 50 {
		c.Advance(0.1)
	}
	if c.Forward != 0 || math.Abs(c.At[0]-95) > 0.001 {
		t.Errorf("at %v, forward %d", c.At, c.Forward)
	}
}

// slope is ground rising `rise` feet a foot east of x = 10, a lake 10 ft deep west of x = -10,
// and the land ending at x = 100, with a slab standing across x = wall if wall isn't 0.
type slope struct{ rise, wall float64 }

func (g slope) At(x, _ float64) (worlds.Sample, bool, error) {
	if x > 100 {
		return worlds.Sample{}, false, nil
	}
	if x < -10 {
		return worlds.Sample{Ground: 0, Water: 10}, true, nil
	}
	return worlds.Sample{Ground: 10 + g.rise*max(x-10, 0), Water: math.NaN()}, true, nil
}

func (g slope) Enters(a, b [3]float64) (string, error) {
	if g.wall != 0 && (a[0] < g.wall) != (b[0] < g.wall) {
		return "a slab", nil
	}
	return "", nil
}

func TestKeepsToTheGround(t *testing.T) {
	var out sent
	c := controlsAt(&out, [3]float64{0, 10, 0}, 0, slope{rise: 1})
	y := 500.0
	c.MoveToward(50, 0, 0, &y)
	c.Advance(1)
	if c.At[0] != 21 || c.At[1] != 21 {
		t.Errorf("at %v", c.At)
	}
}

func TestStopsAtTheEndOfTheLandOrASteepSlope(t *testing.T) {
	var out sent
	c := controlsAt(&out, [3]float64{0, 10, 0}, 0, slope{rise: 1})
	c.MoveToward(200, 0, 0, nil)
	for range 6 {
		c.Advance(1)
	}
	if c.At[0] > 100 || c.Forward != 0 {
		t.Errorf("off the land: at %v, forward %d", c.At, c.Forward)
	}
	steep := controlsAt(&out, [3]float64{0, 10, 0}, 0, slope{rise: 2})
	steep.MoveToward(50, 0, 0, nil)
	for range 3 {
		steep.Advance(0.25)
	}
	if steep.At[0] >= 15 || steep.Forward != 0 {
		t.Errorf("up the steep: at %v, forward %d", steep.At, steep.Forward)
	}
}

func TestStopsAtASlab(t *testing.T) {
	var out sent
	c := controlsAt(&out, [3]float64{0, 10, 0}, 0, slope{wall: 30})
	c.MoveToward(50, 0, 0, nil)
	for range 10 {
		c.Advance(0.25)
	}
	if c.At[0] >= 30 || c.Forward != 0 {
		t.Errorf("at %v, forward %d", c.At, c.Forward)
	}
}

func TestSwimsInDeepWater(t *testing.T) {
	var out sent
	c := controlsAt(&out, [3]float64{0, 10, 0}, 0, slope{rise: 1})
	c.MoveToward(-100, 0, 0, nil)
	c.Advance(0.5)
	c.Advance(1)
	if c.At[1] != 5.5 || !near(c.At[0], -10.5-14.2) {
		t.Errorf("at %v", c.At)
	}
	c.Report(0)
	if !out[len(out)-1].Move.Swim {
		t.Errorf("not swimming: %+v", out[len(out)-1])
	}
}

func TestSinksAndSwimsWhereItsPutInDeepWater(t *testing.T) {
	var out sent
	c := controlsAt(&out, [3]float64{-50, 10.8, 0}, 0, slope{rise: 1})
	c.Report(0)
	if !out[0].Move.Swim || out[0].At[1] != 5.5 {
		t.Errorf("standing in deep water: %+v", out[0])
	}
}
