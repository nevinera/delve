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
