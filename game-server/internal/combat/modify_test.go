package combat

import (
	"encoding/json"
	"math"
	"testing"
)

func modsFrom(t *testing.T, texts ...string) []Mod {
	t.Helper()
	var out []Mod
	for _, text := range texts {
		out = append(out, Mod{Effect: statEffect(t, text), Stacks: 1})
	}
	return out
}

func ability(t *testing.T, text string) *Ability {
	t.Helper()
	var a Ability
	if err := json.Unmarshal([]byte(text), &a); err != nil {
		t.Fatal(err)
	}
	return &a
}

const strikeJSON = `{"id":"hit","tags":["spender"],"school":"holy","castTime":2,"cooldown":10,"range":10,
	"cost":[{"resource":"grit","amount":3},{"resource":"mana","percent":10}],
	"effects":[{"type":"damage","param":"blow","amount":{"base":100,"attackPower":1}},{"type":"heal","amount":50},{"type":"status","status":"mark"}]}`

func TestResolveChangesNumbers(t *testing.T) {
	c := &Class{Statuses: []Status{{ID: "mark", Duration: 6}}}
	a := ability(t, strikeJSON)
	never := func() float64 { return 0.99 }
	got := c.Resolve(a, modsFrom(t,
		`{"type":"modify","abilities":["hit"],"change":"castTime","add":-0.5}`,
		`{"type":"modify","tag":"spender","change":"cooldown","multiply":0.5}`,
		`{"type":"modify","tag":"spender","change":"cost","resource":"grit","add":1}`,
		`{"type":"modify","tag":"spender","change":"cost","multiply":2}`,
		`{"type":"modify","tag":"spender","change":"cost","resource":"rage","set":7}`,
		`{"type":"modify","tag":"spender","change":"damage","multiply":2}`,
		`{"type":"modify","tag":"spender","change":"healing","add":5}`,
		`{"type":"modify","tag":"spender","change":"range","set":30}`,
		`{"type":"modify","tag":"spender","change":"duration","add":4}`,
		`{"type":"modify","tag":"spender","change":"critChance","add":15}`,
		`{"type":"modify","tag":"spender","change":"charges","add":1}`,
		`{"type":"modify","tag":"other","change":"cooldown","set":1}`,
		`{"type":"modify","tag":"spender","change":"cooldown","add":1,"chance":0.5}`,
	), 0, never)
	if got == a || got.CastTime != 1.5 || got.Cooldown != 5 || got.Range.Feet != 30 || got.Charges != 2 {
		t.Fatalf("%+v", got)
	}
	if got.Cost[0].Amount != 8 || got.Cost[1].Percent != 20 || len(got.Cost) != 3 || got.Cost[2].Amount != 14 {
		t.Fatalf("cost %+v", got.Cost)
	}
	if hit := got.Effects[0]; hit.Amount.Min != 200 || hit.Amount.AttackPower != 2 || hit.CritChance != 15 {
		t.Fatalf("damage %+v", hit)
	}
	if got.Effects[1].Amount.Min != 55 || got.Effects[2].Duration != 10 {
		t.Fatalf("effects %+v", got.Effects)
	}
	if a.CastTime != 2 || a.Cost[0].Amount != 3 || a.Effects[0].Amount.Min != 100 || len(a.Cost) != 2 {
		t.Fatalf("changed the class's own ability: %+v", a)
	}
}

func TestResolveLeavesAloneWhatItDoesNotPick(t *testing.T) {
	a := ability(t, strikeJSON)
	if got := (&Class{}).Resolve(a, modsFrom(t, `{"type":"modify","tag":"other","change":"cooldown","set":1}`, `{"type":"modify","school":"frost","change":"cooldown","set":1}`, `{"type":"modify","statuses":["hit"],"change":"cooldown","set":1}`, `{"type":"modify","tag":"spender"}`), 0, nil); got != a {
		t.Fatalf("%+v", got)
	}
}

func TestResolveOrderMasteryAndParam(t *testing.T) {
	a := ability(t, strikeJSON)
	got := (&Class{}).Resolve(a, modsFrom(t,
		`{"type":"modify","tag":"spender","change":"cooldown","multiply":2}`,
		`{"type":"modify","tag":"spender","change":"cooldown","add":1}`,
		`{"type":"modify","tag":"spender","change":"cooldown","set":4}`,
		`{"type":"modify","tag":"spender","change":"damage","mastery":1}`,
		`{"type":"modify","tag":"spender","change":"blow","multiply":2}`,
		`{"type":"modify","tag":"spender","change":"healing","addAmount":{"attackPower":0.5}}`,
		`{"type":"modify","tag":"spender","change":"castTime","add":-9}`,
		`{"type":"modify","tag":"spender","addTags":["late"]}`,
		`{"type":"modify","tag":"late","change":"charges","set":3}`,
	), 10, func() float64 { return 0 })
	if got.Cooldown != 10 {
		t.Fatalf("cooldown = %g, want (4 + 1) x 2", got.Cooldown)
	}
	if math.Abs(got.Effects[0].Amount.Min-220) > 1e-9 {
		t.Fatalf("amount = %g, want 100 x 1.1 x 2", got.Effects[0].Amount.Min)
	}
	if got.Effects[1].Amount.AttackPower != 0.5 || got.CastTime != 0 || got.Charges != 3 {
		t.Fatalf("%+v", got)
	}
}

func TestAmountForCountsHits(t *testing.T) {
	a := ability(t, strikeJSON)
	got := (&Class{}).Resolve(a, modsFrom(t,
		`{"type":"modify","tag":"spender","change":"damage","atTargets":3,"multiply":2}`,
		`{"type":"modify","tag":"spender","change":"damage","perTargetHit":0.1,"maxTotal":0.3}`,
	), 0, nil)
	for _, c := range []struct {
		count int
		want  float64
	}{{1, 110}, {2, 120}, {3, 260}, {5, 260}} {
		if n := got.Effects[0].AmountFor(c.count); math.Abs(n.Min-c.want) > 1e-9 {
			t.Errorf("%d hit: %g, want %g", c.count, n.Min, c.want)
		}
	}
	if got.Effects[1].AmountFor(5).Min != 50 {
		t.Fatal("changed a heal")
	}
}

func TestResolveStatus(t *testing.T) {
	two := 2.0
	s := &Status{ID: "slow", Duration: 6, MaxStacks: 3, Effects: []StatusEffect{{Type: "stat", Stat: "damageTaken", Multiply: &two, Param: "hurt"}, {Type: "stat", Stat: "armor", Add: 5, Param: "plate"}}}
	got := (&Class{}).ResolveStatus(s, 0, modsFrom(t,
		`{"type":"modify","statuses":["slow"],"change":"duration","add":4}`,
		`{"type":"modify","statuses":["slow"],"change":"maxStacks","set":5}`,
		`{"type":"modify","statuses":["slow"],"change":"hurt","add":1}`,
		`{"type":"modify","statuses":["slow"],"change":"plate","multiply":2}`,
		`{"type":"modify","statuses":["other"],"change":"duration","set":1}`,
	), 0)
	if got.Duration != 10 || got.MaxStacks != 5 || *got.Effects[0].Multiply != 3 || got.Effects[1].Add != 10 {
		t.Fatalf("%+v", got)
	}
	if s.Duration != 6 || *s.Effects[0].Multiply != 2 || s.Effects[1].Add != 5 {
		t.Fatalf("changed the class's own status: %+v", s)
	}
	if got := (&Class{}).ResolveStatus(s, 9, nil, 0); got.Duration != 9 {
		t.Fatalf("given duration: %g", got.Duration)
	}
}

func TestResolveChangesWhatAnAbilityIs(t *testing.T) {
	a := ability(t, strikeJSON)
	got := (&Class{}).Resolve(a, modsFrom(t,
		`{"type":"modify","tag":"spender","overrides":{"school":"physical","animation":"dualAttack"}}`,
		`{"type":"modify","tag":"spender","overrides":{"school":"frost","tags":["spender","cold"]}}`,
		`{"type":"modify","tag":"spender","overrides":{"cost":null}}`,
		`{"type":"modify","tag":"spender","addEffects":[{"type":"damage","affects":"self","amount":10}]}`,
		`{"type":"modify","tag":"spender","change":"damage","multiply":2}`,
		`{"type":"modify","tag":"spender","ignores":["cooldown","requires"]}`,
	), 0, nil)
	if got.School != "frost" || got.Animation != "dualAttack" || len(got.Tags) != 2 || got.Cost != nil {
		t.Fatalf("%+v", got)
	}
	if len(got.Effects) != 4 || got.Effects[3].Affects != "self" || got.Effects[3].Amount.Min != 20 {
		t.Fatalf("effects %+v", got.Effects)
	}
	if len(got.Ignores) != 2 {
		t.Fatalf("%+v", got)
	}
	if a.School != "holy" || len(a.Effects) != 3 || len(a.Cost) != 2 || a.Ignores != nil {
		t.Fatalf("changed the class's own ability: %+v", a)
	}
}

func TestResolveStatusChangesWhatItIs(t *testing.T) {
	s := &Status{ID: "slow", Duration: 6, Stacking: "refresh"}
	got := (&Class{}).ResolveStatus(s, 0, modsFrom(t,
		`{"type":"modify","statuses":["slow"],"overrides":{"stacking":"stack","maxStacks":3,"dispel":null}}`,
		`{"type":"modify","statuses":["slow"],"statusEffects":[{"type":"stat","stat":"block","add":5}]}`,
	), 0)
	if got.Stacking != "stack" || got.MaxStacks != 3 || got.Duration != 6 || len(got.Effects) != 1 || got.Effects[0].Add != 5 {
		t.Fatalf("%+v", got)
	}
	if s.Stacking != "refresh" || len(s.Effects) != 0 {
		t.Fatalf("changed the class's own status: %+v", s)
	}
}
