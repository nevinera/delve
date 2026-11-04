package combat

import (
	"encoding/json"
	"testing"
)

func TestReadsAmountsInEachShape(t *testing.T) {
	for raw, want := range map[string]Amount{
		`5`:                                {Min: 5, Max: 5},
		`[2, 9]`:                           {Min: 2, Max: 9},
		`{"spellPower": 1.1}`:              {SpellPower: 1.1},
		`{"base": [1, 3], "weapon": 0.5}`:  {Min: 1, Max: 3, Weapon: 0.5},
		`{"base": 4, "attackPower": 0.25}`: {Min: 4, Max: 4, AttackPower: 0.25},
	} {
		var got Amount
		if err := json.Unmarshal([]byte(raw), &got); err != nil {
			t.Fatal(raw, err)
		}
		if got != want {
			t.Errorf("%s: got %+v", raw, got)
		}
	}
}

func TestReadsAScalingFinisher(t *testing.T) {
	var a Ability
	err := json.Unmarshal([]byte(`{"cost":[{"resource":"combo","amount":1,"all":true}],"effects":[{"type":"damage","affects":"target","amount":{"base":3,"perSpent":{"attackPower":0.2}}},{"type":"status","affects":"target","status":"x","duration":6,"durationPerSpent":6}]}`), &a)
	if err != nil || a.Cost[0].Amount != 1 || a.Effects[0].Amount.Min != 3 {
		t.Fatalf("read %+v, %v", a, err)
	}
}

func TestReadsRanges(t *testing.T) {
	var a Ability
	if err := json.Unmarshal([]byte(`{"range": "melee"}`), &a); err != nil || !a.Range.Melee {
		t.Fatalf("melee: %+v %v", a, err)
	}
	if err := json.Unmarshal([]byte(`{"range": 30}`), &a); err != nil || a.Range.Feet != 30 {
		t.Fatalf("feet: %+v %v", a, err)
	}
	if err := json.Unmarshal([]byte(`{"range": "far"}`), &a); err == nil {
		t.Fatal("took a bad range")
	}
}

func TestStatsFavorPrimaryStats(t *testing.T) {
	s := StatsFor(&Class{PrimaryStats: []string{"intellect"}}, 1)
	if s.Intellect != 12 || s.Strength != 6 || s.SpellPower != 24 || s.AttackPower != 12 || s.MaxHealth != 120 {
		t.Fatalf("%+v", s)
	}
}

func TestRollAddsPartsAndCrits(t *testing.T) {
	s := Plain(0)
	s.SpellPower, s.AttackPower = 10, 20
	a := Amount{Min: 2, Max: 4, SpellPower: 1, AttackPower: 0.5, Weapon: 1}
	n, crit := Roll(a, s, true, func() float64 { return 0.5 })
	if n != 3+10+10+WeaponDamage || crit {
		t.Fatalf("%v %v", n, crit)
	}
	if n, crit := Roll(Amount{Min: 5, Max: 5}, s, true, func() float64 { return 0 }); n != 10 || !crit {
		t.Fatalf("crit: %v %v", n, crit)
	}
}

func TestResourcesStartAndRegenByKind(t *testing.T) {
	if StartResource(Resource{Kind: "mana"}) != 1000 || RegenOf(Resource{Kind: "energy"}) != 10 {
		t.Fatal("mana or energy")
	}
	if StartResource(Resource{Kind: "rage"}) != 0 || RegenOf(Resource{Kind: "rage"}) != 0 || DecayOf(Resource{Kind: "rage"}) != 1 {
		t.Fatal("rage")
	}
	if MaxResource(Resource{Kind: "points", Max: 5}) != 5 || RegenOf(Resource{Kind: "points", Regen: 2}) != 2 {
		t.Fatal("points")
	}
}
