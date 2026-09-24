package instanceconfig_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStatusEffect_NoTrigger(t *testing.T) {
	eff := parseStatusEffect(t, `{"type": "stat", "statName": "damageDone", "modifierType": "multiply", "amount": 1.1}`)
	assert.Nil(t, eff.Trigger)
	assert.Nil(t, eff.TriggeredEffect)
}

func TestStatusEffect_Triggered_HealthBelow(t *testing.T) {
	eff := parseStatusEffect(t, `{
		"type": "triggered",
		"trigger": {"type": "healthBelow", "threshold": 20.0},
		"internalCooldown": 3.0,
		"effect": {"type": "heal", "affects": "self", "amount": 15.0}
	}`)
	require.NotNil(t, eff.Trigger)
	assert.Equal(t, "healthBelow", eff.Trigger.Type)
	assert.Equal(t, 20.0, eff.Trigger.Threshold)
	assert.Equal(t, 3.0, eff.InternalCooldown)

	require.NotNil(t, eff.TriggeredEffect)
	assert.Equal(t, "heal", eff.TriggeredEffect.Type)
	assert.Equal(t, "self", eff.TriggeredEffect.Affects)
	require.NotNil(t, eff.TriggeredEffect.Amount)
	assert.Equal(t, 15.0, eff.TriggeredEffect.Amount.Min())
}

func TestStatusEffect_Triggered_TakesDamage_HarmEffect(t *testing.T) {
	eff := parseStatusEffect(t, `{
		"type": "triggered",
		"trigger": {"type": "takesDamage"},
		"internalCooldown": 5.0,
		"effect": {"type": "harm", "affects": "target", "amount": [10.0, 20.0], "school": "magic"}
	}`)
	require.NotNil(t, eff.Trigger)
	assert.Equal(t, "takesDamage", eff.Trigger.Type)
	assert.Zero(t, eff.Trigger.Threshold)

	require.NotNil(t, eff.TriggeredEffect)
	assert.Equal(t, "harm", eff.TriggeredEffect.Type)
	assert.Equal(t, "target", eff.TriggeredEffect.Affects)
	assert.Equal(t, "magic", eff.TriggeredEffect.School)
}

func TestStatusEffect_Triggered_DealsDamage_ResourceEffect(t *testing.T) {
	eff := parseStatusEffect(t, `{
		"type": "triggered",
		"trigger": {"type": "dealsDamage"},
		"internalCooldown": 0,
		"effect": {"type": "resource", "affects": "self", "resourceName": "fury", "delta": 5.0}
	}`)
	assert.Equal(t, "dealsDamage", eff.Trigger.Type)
	assert.Equal(t, 0.0, eff.InternalCooldown)
	assert.Equal(t, "resource", eff.TriggeredEffect.Type)
	assert.Equal(t, "fury", eff.TriggeredEffect.ResourceName)
	assert.Equal(t, 5.0, eff.TriggeredEffect.Delta)
}

func TestStatusEffect_Triggered_StatusEffect(t *testing.T) {
	eff := parseStatusEffect(t, `{
		"type": "triggered",
		"trigger": {"type": "healthAbove", "threshold": 90.0},
		"internalCooldown": 10.0,
		"effect": {
			"type": "status", "affects": "target", "duration": 5.0,
			"status": {"name": "Weakened", "shortName": "Weak", "treatAs": "debuff", "stacking": "replace", "effects": []}
		}
	}`)
	require.NotNil(t, eff.TriggeredEffect.Status)
	assert.Equal(t, "Weakened", eff.TriggeredEffect.Status.Name)
	assert.Equal(t, 5.0, eff.TriggeredEffect.Duration)
}

func TestStatusEffect_Triggered_NestedTriggeredEffectComposes(t *testing.T) {
	eff := parseStatusEffect(t, `{
		"type": "triggered",
		"trigger": {"type": "dealsDamage"},
		"internalCooldown": 10.0,
		"effect": {
			"type": "status", "affects": "self", "duration": 5.0,
			"status": {
				"name": "Combo", "shortName": "Combo", "treatAs": "inherent", "stacking": "replace",
				"effects": [{"type": "stat", "statName": "damageDone", "modifierType": "add", "amount": 1}]
			}
		}
	}`)
	require.NotNil(t, eff.TriggeredEffect.Status)
	assert.Len(t, eff.TriggeredEffect.Status.Effects, 1)
}
