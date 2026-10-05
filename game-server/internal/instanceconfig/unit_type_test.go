package instanceconfig

import "testing"

func TestUnitType_CombatAndDeathPowers(t *testing.T) {
	ut := UnitType{OnDeath: "Burst", Powers: []Power{{Name: "Slash"}, {Name: "Burst"}}}

	combat := ut.CombatPowers()
	if len(combat) != 1 || combat[0].Name != "Slash" {
		t.Fatalf("CombatPowers = %+v, want just Slash", combat)
	}
	death, ok := ut.DeathPower()
	if !ok || death.Name != "Burst" {
		t.Fatalf("DeathPower = %+v, %v; want Burst", death, ok)
	}

	none := UnitType{Powers: []Power{{Name: "Slash"}}}
	if len(none.CombatPowers()) != 1 {
		t.Fatal("without onDeath, every power is a combat power")
	}
	if _, ok := none.DeathPower(); ok {
		t.Fatal("without onDeath there's no death power")
	}
}
