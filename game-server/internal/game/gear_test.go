package game

import (
	"encoding/json"
	"testing"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// armedClass can hold anything, and has a specialization for each way of holding things.
func armedClass() *combat.Class {
	needs := func(id, wielding string) combat.Ability {
		return combat.Ability{ID: id, Requires: []combat.Condition{{Wielding: wielding}}}
	}
	return &combat.Class{
		ID:       "armed",
		Weapons:  []string{"sword", "axe", "greatsword", "maul"},
		Offhands: []string{"shield", "axe"},
		Abilities: []combat.Ability{
			{ID: "plain"}, needs("bash", "shield"), needs("cleave", "twoHanded"), needs("both", "dual"), needs("single", "oneHanded"),
		},
		Specializations: []combat.Specialization{
			{ID: "wall", Abilities: []string{"plain", "bash"}},
			{ID: "great", Abilities: []string{"cleave"}},
			{ID: "twin", Abilities: []string{"both"}},
			{ID: "duel", Abilities: []string{"single"}},
			{ID: "free", Abilities: []string{"plain"}},
		},
	}
}

func TestGearSuitsTheSpecialization(t *testing.T) {
	class := armedClass()
	for _, c := range []struct{ spec, main, off string }{
		{"", "sword", "shield"},
		{"free", "sword", "shield"},
		{"wall", "sword", "shield"},
		{"great", "greatsword", "none"},
		{"twin", "sword", "axe"},
		{"duel", "sword", "none"},
	} {
		main, off := gearFor(class, combat.Build{Specialization: c.spec})
		if main != c.main || off != c.off {
			t.Fatalf("%q holds %s and %s, want %s and %s", c.spec, main, off, c.main, c.off)
		}
	}
}

func TestGearLeavesTheOffHandEmptyWithATwoHander(t *testing.T) {
	main, off := gearFor(&combat.Class{Weapons: []string{"staff"}, Offhands: []string{"orb"}}, combat.Build{})
	if main != "staff" || off != "none" {
		t.Fatalf("holds %s and %s", main, off)
	}
}

func TestGearIsNothingForAClassThatHoldsNothing(t *testing.T) {
	if main, off := gearFor(&combat.Class{}, combat.Build{}); main != "" || off != "" {
		t.Fatalf("holds %s and %s", main, off)
	}
}

func looks(t *testing.T, p *Player) map[string]any {
	t.Helper()
	look := map[string]any{}
	if err := json.Unmarshal(p.state.Look, &look); err != nil {
		t.Fatal(err)
	}
	return look
}

func TestEnteringGivesACharacterItsGear(t *testing.T) {
	p := &Player{state: Character{ID: 1, Look: json.RawMessage(`{"height":6}`)}}
	p.enterFight(armedClass(), 1, combat.Build{})
	look := looks(t, p)
	if look["weapon"] != "sword" || look["offhand"] != "shield" || look["height"] != 6.0 {
		t.Fatalf("look = %v", look)
	}
}

func TestEnteringKeepsAWeaponTheLookCameWith(t *testing.T) {
	p := &Player{state: Character{ID: 1, Look: json.RawMessage(`{"weapon":"maul"}`)}}
	p.enterFight(armedClass(), 1, combat.Build{})
	if look := looks(t, p); look["weapon"] != "maul" || look["offhand"] != nil {
		t.Fatalf("look = %v", look)
	}
}

func TestACreatureBodyHoldsNothing(t *testing.T) {
	p := &Player{state: Character{ID: 1, Look: json.RawMessage(`{"body":"wolf"}`)}}
	p.enterFight(armedClass(), 1, combat.Build{})
	if look := looks(t, p); look["weapon"] != nil {
		t.Fatalf("look = %v", look)
	}
}

func TestChangingSpecializationChangesGearUnlessYouPickedYourOwn(t *testing.T) {
	h, p, _ := fighting(t)
	armed := armedClass()
	p.fight.class, p.fight.level = armed, 100
	p.layer.applyBuild(p, combat.Build{Specialization: "great"}, h.now())
	got := heard(p, "gear")
	if len(got) != 1 || got[0]["look"].(map[string]any)["weapon"] != "greatsword" {
		t.Fatalf("gear = %v", got)
	}
	p.layer.applyBuild(p, combat.Build{Specialization: "great"}, h.now())
	if got := heard(p, "gear"); len(got) != 0 {
		t.Fatalf("told again with nothing changed: %v", got)
	}
	p.systemAdmin = true
	say(t, p, "/weapon axe")
	heard(p, "gear")
	p.layer.applyBuild(p, combat.Build{Specialization: "wall"}, h.now())
	if got := heard(p, "gear"); len(got) != 0 {
		t.Fatalf("changed a picked weapon: %v", got)
	}
	if look := looks(t, p); look["weapon"] != "axe" {
		t.Fatalf("look = %v", look)
	}
}
