package combat

import (
	"encoding/json"
	"testing"
)

func statEffect(t *testing.T, text string) *StatusEffect {
	t.Helper()
	var e StatusEffect
	if err := json.Unmarshal([]byte(text), &e); err != nil {
		t.Fatal(err)
	}
	return &e
}

func TestSheet(t *testing.T) {
	base := StatsFor(&Class{PrimaryStats: []string{"strength"}}, 1)
	mod := func(text string, stacks int) Mod { return Mod{Effect: statEffect(t, text), Stacks: stacks} }
	s := Sheet(base, []string{"strength"}, []Mod{
		mod(`{"type":"stat","stat":"strength","add":10}`, 2),
		mod(`{"type":"stat","stat":"stamina","multiply":2}`, 1),
		mod(`{"type":"stat","stat":"attackPower","multiply":1.5}`, 1),
		mod(`{"type":"stat","stat":"damageTaken","multiply":0.5}`, 2),
		mod(`{"type":"stat","stat":"critChance","add":10}`, 1),
		mod(`{"type":"stat","stat":"spellPower","fromStat":"primary","share":0.5}`, 1),
		mod(`{"type":"stat","stat":"block","add":15}`, 1),
		mod(`{"type":"stat","stat":"resourceMax","resource":"rage","add":15}`, 1),
	})
	if s.Strength != base.Strength+20 {
		t.Fatalf("strength = %g", s.Strength)
	}
	if want := (base.AttackPower + 40) * 1.5; s.AttackPower != want {
		t.Fatalf("attack power = %g, want %g", s.AttackPower, want)
	}
	if want := base.MaxHealth + 10*base.Stamina; s.MaxHealth != want {
		t.Fatalf("max health = %g, want %g", s.MaxHealth, want)
	}
	if s.DamageTaken != 0.25 || s.CritChance != 15 || *s.Others["block"] != 15 {
		t.Fatalf("stats = %+v", s)
	}
	if want := base.SpellPower + 0.5*s.Strength; s.SpellPower != want {
		t.Fatalf("spell power = %g, want %g", s.SpellPower, want)
	}
	if base.Others != nil {
		t.Fatal("working out a sheet changed the base")
	}
}

func TestFromStatOfCaster(t *testing.T) {
	caster := Plain(0)
	caster.SpellPower = 100
	s := Sheet(Plain(0), nil, []Mod{{Effect: statEffect(t, `{"type":"stat","stat":"spellPower","fromStat":"spellPower","share":0.1,"ofCaster":true}`), Stacks: 1, Caster: &caster}})
	if s.SpellPower != 10 {
		t.Fatalf("spell power = %g", s.SpellPower)
	}
}

func TestANarrowedStatMatchesHits(t *testing.T) {
	ability := &Ability{ID: "a", Tags: []string{"finisher"}}
	hit := &HitContext{Schools: []string{"holy", "fire"}, Category: "bleed", Ability: ability, Status: "s", Kinds: []string{"melee"}, Other: 7}
	for _, c := range []struct {
		text string
		want bool
	}{
		{`{"type":"stat","stat":"damageDone"}`, true},
		{`{"type":"stat","stat":"damageDone","school":"holy"}`, true},
		{`{"type":"stat","stat":"damageDone","school":"frost"}`, false},
		{`{"type":"stat","stat":"damageDone","schools":["frost","fire"]}`, true},
		{`{"type":"stat","stat":"damageDone","hit":"melee"}`, true},
		{`{"type":"stat","stat":"damageDone","hit":"area"}`, false},
		{`{"type":"stat","stat":"damageDone","category":"bleed"}`, true},
		{`{"type":"stat","stat":"damageDone","categories":["disease"]}`, false},
		{`{"type":"stat","stat":"damageDone","abilities":["a"]}`, true},
		{`{"type":"stat","stat":"damageDone","abilities":["b"]}`, false},
		{`{"type":"stat","stat":"damageDone","tag":"finisher"}`, true},
		{`{"type":"stat","stat":"damageDone","statuses":["s"]}`, true},
		{`{"type":"stat","stat":"damageDone","casterOnly":true}`, true},
		{`{"type":"stat","stat":"damageDone","source":"summons"}`, false},
	} {
		if got := statEffect(t, c.text).Applies(hit, 7); got != c.want {
			t.Errorf("%s = %v", c.text, got)
		}
	}
	if statEffect(t, `{"type":"stat","stat":"damageDone","casterOnly":true}`).Applies(hit, 8) {
		t.Error("casterOnly matched someone else's hit")
	}
	if statEffect(t, `{"type":"stat","stat":"damageDone","school":"holy"}`).Applies(nil, 7) {
		t.Error("a narrowed stat counted with no hit")
	}
}

func TestPoolCountsTheStatsThatNameIt(t *testing.T) {
	mod := func(text string, stacks int) Mod { return Mod{Effect: statEffect(t, text), Stacks: stacks} }
	rage := Resource{Key: "rage", Kind: "rage"}
	got := PoolOf(rage, Stats{}, nil, []Mod{
		mod(`{"type":"stat","stat":"resourceMax","resource":"rage","add":20}`, 2),
		mod(`{"type":"stat","stat":"resourceMax","resource":"rage","multiply":0.5}`, 1),
		mod(`{"type":"stat","stat":"resourceMax","resource":"mana","add":1000}`, 1),
		mod(`{"type":"stat","stat":"resourceRegen","resource":"rage","add":3}`, 1),
		mod(`{"type":"stat","stat":"resourceRest","resource":"rage","add":10}`, 1),
		mod(`{"type":"stat","stat":"resourceDecay","resource":"rage","multiply":2}`, 1),
		mod(`{"type":"stat","stat":"resourceGain","resource":"rage","add":0.5}`, 1),
	})
	if want := (Pool{Max: 70, Regen: 3, Rest: 10, Decay: 2, Gain: 1.5}); got != want {
		t.Fatalf("pool = %+v, want %+v", got, want)
	}
	if got := PoolOf(rage, Stats{}, nil, []Mod{mod(`{"type":"stat","stat":"resourceMax","resource":"rage","add":-500}`, 1)}); got.Max != 0 {
		t.Fatalf("max = %g, want 0", got.Max)
	}
	strong := Stats{Strength: 40}
	if got := PoolOf(rage, strong, []string{"strength"}, []Mod{mod(`{"type":"stat","stat":"resourceMax","resource":"rage","fromStat":"primary","share":0.5}`, 1)}); got.Max != 120 {
		t.Fatalf("max from strength = %g, want 120", got.Max)
	}
}

func TestPoolAfter(t *testing.T) {
	for _, c := range []struct {
		name     string
		pool     Pool
		have     float64
		fighting bool
		want     float64
	}{
		{"regen stops at the max", Pool{Max: 10, Regen: 5}, 8, true, 10},
		{"decay waits for combat to end", Pool{Max: 10, Decay: 1}, 5, true, 5},
		{"decay runs out of combat", Pool{Max: 10, Decay: 1}, 5, false, 4},
		{"decay stops at nothing", Pool{Max: 10, Decay: 9}, 5, false, 0},
		{"decay stops at the rest", Pool{Max: 10, Rest: 4, Decay: 9}, 5, false, 4},
		{"it climbs to the rest", Pool{Max: 10, Rest: 4, Decay: 9}, 1, false, 4},
		{"a rest with no decay drifts at 1", Pool{Max: 10, Rest: 4}, 1, false, 2},
		{"a rest waits for combat to end", Pool{Max: 10, Rest: 4}, 1, true, 1},
		{"no decay and no rest holds", Pool{Max: 10}, 5, false, 5},
		{"it falls to a lower max", Pool{Max: 3}, 5, true, 3},
	} {
		if got := c.pool.After(c.have, 1, c.fighting); got != c.want {
			t.Errorf("%s: %g, want %g", c.name, got, c.want)
		}
	}
}
