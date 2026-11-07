package game

import "testing"

// threatened has two players by the hostile goblin, the first of them the one it noticed.
func threatened(t *testing.T) (*Hub, *Player, *Player, *mob) {
	people := characters(nil)
	people.class[1], people.class[2] = "frst0001", "frst0001"
	h := NewHub(fightingWorld{}, people)
	h.roll = func() float64 { return 0.99 }
	c := clockOf(h)
	a := enter(t, h, 1)
	pass(h, c, 0.1)
	b := enter(t, h, 2)
	mean := a.layer.mobs[1]
	if mean.mind.mode != "fight" || mean.mind.target != a.ID() {
		t.Fatalf("the goblin is %+v", mean.mind)
	}
	return h, a, b, mean
}

func TestDamageMakesThreatAndPullsAMobPastItsTarget(t *testing.T) {
	h, a, b, mean := threatened(t)
	cm := a.layer.combat
	cm.addThreat(mean, &a.fight.unit, 100, h.now())
	// From further off than its reach, passing by a tenth isn't enough.
	b.state.At = [3]float64{mean.char.At[0] + 30, mean.char.At[1], mean.char.At[2]}
	cm.addThreat(mean, &b.fight.unit, 120, h.now())
	if got := cm.target(mean); got != &a.fight.unit {
		t.Fatalf("at 120 against 100, from afar, it fights %d", got.ID)
	}
	cm.addThreat(mean, &b.fight.unit, 11, h.now())
	if got := cm.target(mean); got != &b.fight.unit {
		t.Fatalf("at 131 against 100, it still fights %d", got.ID)
	}
	if mean.mind.threat[b.ID()] != 131 {
		t.Fatalf("threat = %v", mean.mind.threat)
	}
}

func TestFromWithinReachATenthPullsAMob(t *testing.T) {
	h, a, b, mean := threatened(t)
	cm := a.layer.combat
	cm.addThreat(mean, &a.fight.unit, 100, h.now())
	b.state.At = mean.char.At
	cm.addThreat(mean, &b.fight.unit, 111, h.now())
	if got := cm.target(mean); got != &b.fight.unit {
		t.Fatalf("at 111 against 100 in melee, it fights %d", got.ID)
	}
}

func TestHealingMakesThreatOnTheMobsFightingTheHealed(t *testing.T) {
	h, a, b, mean := threatened(t)
	a.layer.combat.healThreatOf(&b.fight.unit, &a.fight.unit, 40, h.now())
	if mean.mind.threat[b.ID()] != 20 {
		t.Fatalf("threat = %v", mean.mind.threat)
	}
	calm := a.layer.mobs[2]
	if calm.mind.threat != nil {
		t.Fatal("healing made threat on a mob not fighting the one healed")
	}
}

func TestAMobWhoseTargetDiesFightsTheNextAndGoesHomeWithNoOneLeft(t *testing.T) {
	h, a, b, mean := threatened(t)
	cm := a.layer.combat
	cm.addThreat(mean, &b.fight.unit, 5, h.now())
	cm.dropThreat(&a.fight.unit, h.now())
	if mean.mind.mode != "fight" || mean.mind.target != b.ID() {
		t.Fatalf("with its target gone, the goblin is %+v", mean.mind)
	}
	cm.dropThreat(&b.fight.unit, h.now())
	if mean.mind.mode != "home" || mean.mind.threat != nil {
		t.Fatalf("with no one left, the goblin is %+v", mean.mind)
	}
}
