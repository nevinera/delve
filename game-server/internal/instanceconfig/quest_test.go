package instanceconfig_test

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// The fixture Rails' QuestObjective spec checks too, so both sides hash
// objectives the same way.
func TestQuestObjectiveHash_MatchesRails(t *testing.T) {
	data, err := os.ReadFile("../../../spec/fixtures/quests/objective_hashes.json")
	require.NoError(t, err)
	var entries []struct {
		Objective instanceconfig.QuestObjective `json:"objective"`
		Hash      string                        `json:"hash"`
	}
	require.NoError(t, json.Unmarshal(data, &entries))
	require.NotEmpty(t, entries)
	for _, entry := range entries {
		assert.Equal(t, entry.Hash, entry.Objective.Hash(), "%+v", entry.Objective)
	}
}

func TestQuestObjectiveRequired(t *testing.T) {
	assert.Equal(t, 1, instanceconfig.QuestObjective{}.Required())
	assert.Equal(t, 5, instanceconfig.QuestObjective{Count: 5}.Required())
}
