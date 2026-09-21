package instance_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func stateWithResourceUnit(resource, defaultValue, returnRate float64) (*instancestate.UnitState, *instancestate.InstanceState) {
	u := &instancestate.UnitState{
		Status:               instancestate.UnitStatusIdle,
		Resource:             resource,
		MaxResource:          100.0,
		ResourceDefaultValue: defaultValue,
		ResourceReturnRate:   returnRate,
	}
	s := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): u}}
	return u, s
}

func TestTickResourceRegen_RegeneratesUpTowardDefault(t *testing.T) {
	u, s := stateWithResourceUnit(50.0, 100.0, 10.0)

	instance.TickResourceRegenForTest(s, 1.0)

	assert.Equal(t, 60.0, u.Resource)
}

func TestTickResourceRegen_DecaysDownTowardDefault(t *testing.T) {
	u, s := stateWithResourceUnit(50.0, 0.0, 10.0)

	instance.TickResourceRegenForTest(s, 1.0)

	assert.Equal(t, 40.0, u.Resource)
}

func TestTickResourceRegen_StopsExactlyAtDefaultValue(t *testing.T) {
	u, s := stateWithResourceUnit(95.0, 100.0, 10.0)

	instance.TickResourceRegenForTest(s, 1.0)

	assert.Equal(t, 100.0, u.Resource)
}

func TestTickResourceRegen_NoOpAtDefaultValue(t *testing.T) {
	u, s := stateWithResourceUnit(100.0, 100.0, 10.0)

	instance.TickResourceRegenForTest(s, 1.0)

	assert.Equal(t, 100.0, u.Resource)
}

func TestTickResourceRegen_NoOpWithZeroReturnRate(t *testing.T) {
	u, s := stateWithResourceUnit(0.0, 0.0, 0.0)

	instance.TickResourceRegenForTest(s, 1.0)

	assert.Equal(t, 0.0, u.Resource)
}

func TestTickResourceRegen_DeadUnitDoesNotRegen(t *testing.T) {
	u, s := stateWithResourceUnit(50.0, 100.0, 10.0)
	u.Status = instancestate.UnitStatusDead

	instance.TickResourceRegenForTest(s, 1.0)

	assert.Equal(t, 50.0, u.Resource)
}
