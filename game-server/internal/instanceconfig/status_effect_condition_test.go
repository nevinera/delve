package instanceconfig_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func parseStatusEffect(t *testing.T, data string) instanceconfig.StatusEffect {
	t.Helper()
	var eff instanceconfig.StatusEffect
	require.NoError(t, json.Unmarshal([]byte(data), &eff))
	return eff
}

func TestStatusEffect_NoCondition(t *testing.T) {
	eff := parseStatusEffect(t, `{"type": "stat", "statName": "damageDone", "modifierType": "multiply", "amount": 1.1}`)
	assert.Nil(t, eff.Condition)
}

func TestStatusEffect_Condition_HasStatus(t *testing.T) {
	eff := parseStatusEffect(t, `{
		"type": "stat", "statName": "damageDone", "modifierType": "multiply", "amount": 1.1,
		"condition": {"type": "hasStatus", "statusName": "Enrage"}
	}`)
	require.NotNil(t, eff.Condition)
	assert.Equal(t, "hasStatus", eff.Condition.Type)
	assert.Equal(t, "Enrage", eff.Condition.StatusName)
}

func TestStatusEffect_Condition_SelfHealthPct(t *testing.T) {
	eff := parseStatusEffect(t, `{
		"type": "stat", "statName": "damageDone", "modifierType": "multiply", "amount": 1.1,
		"condition": {"type": "selfHealthPct", "comparison": "below", "threshold": 30.0}
	}`)
	require.NotNil(t, eff.Condition)
	assert.Equal(t, "selfHealthPct", eff.Condition.Type)
	assert.Equal(t, "below", eff.Condition.Comparison)
	assert.Equal(t, 30.0, eff.Condition.Threshold)
}

func TestStatusEffect_Condition_TargetHealthPct(t *testing.T) {
	eff := parseStatusEffect(t, `{
		"type": "harm", "statName": "damageDone",
		"condition": {"type": "targetHealthPct", "comparison": "above", "threshold": 50.0}
	}`)
	require.NotNil(t, eff.Condition)
	assert.Equal(t, "targetHealthPct", eff.Condition.Type)
	assert.Equal(t, "above", eff.Condition.Comparison)
	assert.Equal(t, 50.0, eff.Condition.Threshold)
}

func TestStatusEffect_Condition_CasterResource(t *testing.T) {
	eff := parseStatusEffect(t, `{
		"type": "recurring", "tickRate": 2.0, "onTick": "harm", "amount": 5.0,
		"condition": {"type": "casterResource", "resourceName": "combo points", "comparison": "above", "threshold": 3.0}
	}`)
	require.NotNil(t, eff.Condition)
	assert.Equal(t, "casterResource", eff.Condition.Type)
	assert.Equal(t, "combo points", eff.Condition.ResourceName)
	assert.Equal(t, "above", eff.Condition.Comparison)
	assert.Equal(t, 3.0, eff.Condition.Threshold)
}
