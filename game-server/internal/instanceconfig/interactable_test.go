package instanceconfig_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func TestInteractable_ParsesFromAMap_IgnoringHowItsDrawn(t *testing.T) {
	var m instanceconfig.Map
	require.NoError(t, json.Unmarshal([]byte(`{"identifier": "hills", "interactables": [{
		"identifier": "snare-1", "name": "Goblin Snare", "stamp": "quest-props/goblin-snare", "usedStamp": "quest-props/goblin-snare-used",
		"whenUnavailable": "used", "scale": 1.5, "position": {"x": 120, "y": 340, "angle": 0},
		"useTime": 2.5, "useText": "Cutting", "annotations": {"intent": "x"}
	}]}`), &m))
	require.Len(t, m.Interactables, 1)
	snare := m.Interactables[0]
	assert.Equal(t, "snare-1", snare.Identifier)
	assert.Equal(t, 2.5, snare.UseSeconds())
	assert.Equal(t, "Cutting", snare.UseText)
	assert.Equal(t, 120.0, snare.Position.X)
}

func TestInteractable_UseSeconds_DefaultsToOneAndAllowsInstant(t *testing.T) {
	assert.Equal(t, 1.0, instanceconfig.Interactable{}.UseSeconds())
	instant := 0.0
	assert.Equal(t, 0.0, instanceconfig.Interactable{UseTime: &instant}.UseSeconds())
}

func TestQuestObjective_ParsesAUseObjectivesInteractables(t *testing.T) {
	var o instanceconfig.QuestObjective
	require.NoError(t, json.Unmarshal([]byte(`{"type": "use", "zone": "thornwood", "map": "the-hills", "interactables": ["snare-1", "snare-2"]}`), &o))
	assert.Equal(t, []string{"snare-1", "snare-2"}, o.Interactables)
}
