package command_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func TestApplyHeal_CreditsOnlyWhatWasActuallyRestoredToSomeoneElse(t *testing.T) {
	healer := &instancestate.UnitState{Health: 100, MaxHealth: 100, CombatStats: &instancestate.CombatStats{}}
	ally := &instancestate.UnitState{Health: 90, MaxHealth: 100, CombatStats: &instancestate.CombatStats{}}

	command.ApplyHeal(healer, ally, 30, instanceconfig.Zone{})

	assert.Equal(t, 100.0, ally.Health)
	assert.Equal(t, 10.0, healer.RecentHealing, "overheal earns no credit")
}

func TestApplyHeal_SelfHealingEarnsNoCredit(t *testing.T) {
	healer := &instancestate.UnitState{Health: 50, MaxHealth: 100, CombatStats: &instancestate.CombatStats{}}

	command.ApplyHeal(healer, healer, 20, instanceconfig.Zone{})

	assert.Equal(t, 70.0, healer.Health)
	assert.Zero(t, healer.RecentHealing)
}
