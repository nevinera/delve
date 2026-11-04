package game

import (
	"testing"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// spending is a fight with an ability on a 30 s cooldown, and others that work on it.
func spending(t *testing.T, charges int, effects ...combat.Effect) (*Hub, *Player, *float64) {
	t.Helper()
	zero := 0.0
	var abilities []combat.Ability
	for i, e := range effects {
		abilities = append(abilities, combat.Ability{ID: "work" + string(rune('a'+i)), Name: "Work", Target: "self", GCD: &zero, Effects: []combat.Effect{e}})
	}
	h, p, c := consuming(t, combat.Status{ID: "unused", Name: "Unused"})
	p.fight.class.Abilities = append(p.fight.class.Abilities, abilities...)
	p.fight.class.Abilities = append(p.fight.class.Abilities, combat.Ability{ID: "big", Name: "Big", Target: "self", GCD: &zero, Cooldown: 30, Charges: charges, Tags: []string{"spender"}})
	return h, p, c
}

func lastCooldown(t *testing.T, p *Player, ability string) float64 {
	t.Helper()
	got := heard(p, "cooldown")
	for i := len(got) - 1; i >= 0; i-- {
		if got[i]["ability"] == ability {
			return got[i]["seconds"].(float64)
		}
	}
	t.Fatalf("heard no cooldown for %s: %v", ability, got)
	return 0
}

func TestCooldownEffectTakesTimeOff(t *testing.T) {
	h, p, c := spending(t, 1, combat.Effect{Type: "cooldown", Affects: "self", Abilities: []string{"big"}, By: 10})
	use(t, p, "big")
	pass(h, c, 0.05)
	heard(p)
	use(t, p, "worka")
	pass(h, c, 0.05)
	if got := lastCooldown(t, p, "big"); got < 19.8 || got > 20 {
		t.Fatalf("the bar was told %g s, want about 20", got)
	}
	pass(h, c, 15)
	use(t, p, "big")
	pass(h, c, 0.05)
	if got := heard(p, "refused"); len(got) != 1 {
		t.Fatalf("15 s in it should still be cooling: %v", got)
	}
	pass(h, c, 6)
	use(t, p, "big")
	pass(h, c, 0.05)
	if got := heard(p, "refused"); len(got) != 0 {
		t.Fatalf("21 s in it should be ready: %v", got)
	}
}

func TestCooldownEffectResetsByTag(t *testing.T) {
	h, p, c := spending(t, 2, combat.Effect{Type: "cooldown", Affects: "self", Tag: "spender", Reset: true})
	use(t, p, "big")
	use(t, p, "big")
	pass(h, c, 0.05)
	heard(p)
	use(t, p, "worka")
	pass(h, c, 0.05)
	if got := lastCooldown(t, p, "big"); got != 0 {
		t.Fatalf("the bar was told %g s, want 0", got)
	}
	if got := len(p.fight.cooldowns["big"]); got != 0 {
		t.Fatalf("%d charges still spent", got)
	}
}

func TestCooldownEffectGivesChargesBack(t *testing.T) {
	h, p, c := spending(t, 2, combat.Effect{Type: "cooldown", Affects: "self", Abilities: []string{"big"}, Charges: 1})
	use(t, p, "big")
	pass(h, c, 0.05)
	if got := lastCooldown(t, p, "big"); got != 0 {
		t.Fatalf("with a charge left the bar was told %g s", got)
	}
	use(t, p, "big")
	pass(h, c, 0.05)
	if got := lastCooldown(t, p, "big"); got < 29 || got > 30 {
		t.Fatalf("with none left the bar was told %g s", got)
	}
	use(t, p, "worka")
	pass(h, c, 0.05)
	if got := lastCooldown(t, p, "big"); got != 0 {
		t.Fatalf("with one back the bar was told %g s", got)
	}
	if got := len(p.fight.cooldowns["big"]); got != 1 {
		t.Fatalf("%d charges spent, want 1", got)
	}
}
