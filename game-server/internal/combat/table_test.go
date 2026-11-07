package combat

import (
	"math"
	"strconv"
	"testing"
)

func at(n float64) func() float64 { return func() float64 { return n / 100 } }

func TestAttackRoll(t *testing.T) {
	on := Stats{Dodge: 10, Parry: 10}
	for _, c := range []struct {
		roll         float64
		melee, front bool
		want         string
	}{
		{4, true, true, "miss"},
		{4, false, false, "miss"},
		{5, true, true, "dodge"},
		{14, true, false, "dodge"},
		{15, true, true, "parry"},
		{24, true, true, "parry"},
		{15, true, false, ""},
		{25, true, true, ""},
		{6, false, true, ""},
	} {
		if got := AttackRoll(on, c.melee, c.front, at(c.roll)); got != c.want {
			t.Errorf("%+v: %q", c, got)
		}
	}
}

func TestBlocks(t *testing.T) {
	on := Stats{Block: 20}
	if !Blocks(on, true, true, at(19)) || Blocks(on, true, true, at(20)) || Blocks(on, false, true, at(0)) || Blocks(on, true, false, at(0)) || Blocks(Stats{}, true, true, at(0)) {
		t.Fatal("blocks")
	}
}

func TestRatingsFeedWhatTheyFeed(t *testing.T) {
	base := StatsFor(&Class{}, 10)
	per := RatingPerPoint(10)
	mod := func(text string) Mod { return Mod{Effect: statEffect(t, text), Stacks: 1} }
	s := Sheet(base, nil, []Mod{
		mod(`{"type":"stat","stat":"critRating","add":` + num(per*7) + `}`),
		mod(`{"type":"stat","stat":"hasteRating","add":` + num(per*10) + `}`),
		mod(`{"type":"stat","stat":"masteryRating","add":` + num(per*2) + `}`),
		mod(`{"type":"stat","stat":"speedRating","add":` + num(per*5) + `}`),
	})
	if s.CritChance != 12 || s.MasteryPercent() != 2 || s.MovementSpeed != 105 || s.Haste() != 0.1 {
		t.Fatalf("%+v", s)
	}
	if got := s.Hasted(1.1); math.Abs(got-1) > 1e-9 {
		t.Fatalf("hasted %g", got)
	}
	if base.Dodge != StartDodge || base.Parry != StartParry || base.Block != 0 {
		t.Fatalf("start %+v", base)
	}
	if Plain(1).Dodge != 0 {
		t.Fatal("plain units dodge")
	}
}

func num(n float64) string { return strconv.FormatFloat(n, 'f', -1, 64) }

func TestTaken(t *testing.T) {
	mod := func(text string) Mod { return Mod{Effect: statEffect(t, text), Stacks: 1} }
	s := Sheet(Plain(100), nil, []Mod{mod(`{"type":"stat","stat":"armor","add":485}`), mod(`{"type":"stat","stat":"avoidance","add":10}`), mod(`{"type":"stat","stat":"versatility","add":20}`)})
	if got := s.Taken(100, HitContext{Schools: []string{"holy"}}, 1); got != 90 {
		t.Fatalf("holy, versatility only: %g", got)
	}
	if got := s.Taken(100, HitContext{Schools: []string{"physical"}}, 1); math.Abs(got-45) > 1e-9 {
		t.Fatalf("physical, half from armor: %g", got)
	}
	if got := s.Taken(100, HitContext{Schools: []string{"holy"}, Kinds: []string{"effectArea"}}, 1); math.Abs(got-81) > 1e-9 {
		t.Fatalf("effect area: %g", got)
	}
}
