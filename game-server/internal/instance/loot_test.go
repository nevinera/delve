package instance_test

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// makeLootItem builds a PendingLootItem with the given claims.
func makeLootItem(identifier string, claims ...instancestate.CharacterLootClaim) instancestate.PendingLootItem {
	return instancestate.PendingLootItem{
		ClaimID: uuid.New(),
		Item:    instanceconfig.Item{Identifier: identifier, Name: identifier, Slot: "head", Ilvl: 100},
		Claims:  claims,
	}
}

func charClaim(id uuid.UUID, state instancestate.LootClaimState) instancestate.CharacterLootClaim {
	return instancestate.CharacterLootClaim{CharacterUnitID: id, State: state}
}

func sendResult(item *instancestate.PendingLootItem, result instancestate.LootResult) {
	item.Claim = &instancestate.LootClaim{
		ClaimedBy: item.Claims[0].CharacterUnitID,
		Result:    make(chan instancestate.LootResult, 1),
	}
	item.Claim.Result <- result
}

// ---------------------------------------------------------------------------
// sweepLootClaims - state transitions
// ---------------------------------------------------------------------------

func TestSweepLootClaims_Remove_ClaimerReceived_OthersGone(t *testing.T) {
	claimer := uuid.New()
	other := uuid.New()
	state := &instancestate.InstanceState{
		Units: map[uuid.UUID]*instancestate.UnitState{
			uuid.New(): {
				Status: instancestate.UnitStatusDead,
				LootItems: []instancestate.PendingLootItem{
					makeLootItem("sword",
						charClaim(claimer, instancestate.LootClaimStateLockedForMe),
						charClaim(other, instancestate.LootClaimStateLocked),
					),
				},
			},
		},
	}
	for _, u := range state.Units {
		sendResult(&u.LootItems[0], instancestate.LootResult{Remove: true, ConfirmedOwned: true})
	}

	instance.SweepLootClaimsForTest(state)

	for _, u := range state.Units {
		assert.Empty(t, u.LootItems, "item should be removed from loot list")
	}
	assert.Len(t, state.PendingOwnershipUpdates, 1)
}

func TestSweepLootClaims_ExactVersion_ClaimerOwned(t *testing.T) {
	claimer := uuid.New()
	state := &instancestate.InstanceState{
		Units: map[uuid.UUID]*instancestate.UnitState{
			uuid.New(): {
				Status: instancestate.UnitStatusDead,
				LootItems: []instancestate.PendingLootItem{
					makeLootItem("sword", charClaim(claimer, instancestate.LootClaimStateLockedForMe)),
				},
			},
		},
	}
	for _, u := range state.Units {
		sendResult(&u.LootItems[0], instancestate.LootResult{Remove: false, ConfirmedOwned: true, ExactVersion: true})
	}

	instance.SweepLootClaimsForTest(state)

	for _, u := range state.Units {
		require.Len(t, u.LootItems, 1)
		assert.Nil(t, u.LootItems[0].Claim)
		assert.Equal(t, instancestate.LootClaimStateOwned, u.LootItems[0].Claims[0].State)
	}
}

func TestSweepLootClaims_OtherVersion_ClaimerUpgraded(t *testing.T) {
	claimer := uuid.New()
	state := &instancestate.InstanceState{
		Units: map[uuid.UUID]*instancestate.UnitState{
			uuid.New(): {
				Status: instancestate.UnitStatusDead,
				LootItems: []instancestate.PendingLootItem{
					makeLootItem("sword", charClaim(claimer, instancestate.LootClaimStateLockedForMe)),
				},
			},
		},
	}
	for _, u := range state.Units {
		sendResult(&u.LootItems[0], instancestate.LootResult{Remove: false, ConfirmedOwned: true, ExactVersion: false})
	}

	instance.SweepLootClaimsForTest(state)

	for _, u := range state.Units {
		require.Len(t, u.LootItems, 1)
		assert.Equal(t, instancestate.LootClaimStateUpgraded, u.LootItems[0].Claims[0].State)
	}
}

func TestSweepLootClaims_Failure_ClaimerAndLockedOthersReset(t *testing.T) {
	claimer := uuid.New()
	other := uuid.New()
	state := &instancestate.InstanceState{
		Units: map[uuid.UUID]*instancestate.UnitState{
			uuid.New(): {
				Status: instancestate.UnitStatusDead,
				LootItems: []instancestate.PendingLootItem{
					makeLootItem("sword",
						charClaim(claimer, instancestate.LootClaimStateLockedForMe),
						charClaim(other, instancestate.LootClaimStateLocked),
					),
				},
			},
		},
	}
	for _, u := range state.Units {
		sendResult(&u.LootItems[0], instancestate.LootResult{Remove: false, ConfirmedOwned: false})
	}

	instance.SweepLootClaimsForTest(state)

	for _, u := range state.Units {
		require.Len(t, u.LootItems, 1)
		assert.Nil(t, u.LootItems[0].Claim)
		for _, c := range u.LootItems[0].Claims {
			assert.Equal(t, instancestate.LootClaimStateAvailable, c.State)
		}
	}
	assert.Len(t, state.PendingLootFailures, 1)
}

func TestSweepLootClaims_Failure_NonLockedClaimsUnchanged(t *testing.T) {
	claimer := uuid.New()
	upgrading := uuid.New()
	state := &instancestate.InstanceState{
		Units: map[uuid.UUID]*instancestate.UnitState{
			uuid.New(): {
				Status: instancestate.UnitStatusDead,
				LootItems: []instancestate.PendingLootItem{
					makeLootItem("sword",
						charClaim(claimer, instancestate.LootClaimStateLockedForMe),
						charClaim(upgrading, instancestate.LootClaimStateUpgrade),
					),
				},
			},
		},
	}
	for _, u := range state.Units {
		sendResult(&u.LootItems[0], instancestate.LootResult{Remove: false, ConfirmedOwned: false})
	}

	instance.SweepLootClaimsForTest(state)

	for _, u := range state.Units {
		for _, c := range u.LootItems[0].Claims {
			if c.CharacterUnitID == upgrading {
				assert.Equal(t, instancestate.LootClaimStateUpgrade, c.State, "upgrade claim should be unchanged")
			}
		}
	}
}

func TestSweepLootClaims_NoClaim_ItemUnchanged(t *testing.T) {
	char := uuid.New()
	state := &instancestate.InstanceState{
		Units: map[uuid.UUID]*instancestate.UnitState{
			uuid.New(): {
				Status: instancestate.UnitStatusDead,
				LootItems: []instancestate.PendingLootItem{
					makeLootItem("sword", charClaim(char, instancestate.LootClaimStateAvailable)),
				},
			},
		},
	}

	instance.SweepLootClaimsForTest(state)

	for _, u := range state.Units {
		require.Len(t, u.LootItems, 1)
		assert.Equal(t, instancestate.LootClaimStateAvailable, u.LootItems[0].Claims[0].State)
	}
}

// ---------------------------------------------------------------------------
// lootItemsEqual
// ---------------------------------------------------------------------------

func TestLootItemsEqual_IdenticalEmpty(t *testing.T) {
	assert.True(t, instance.LootItemsEqualForTest(nil, nil))
}

func TestLootItemsEqual_DifferentLength(t *testing.T) {
	a := []instancestate.PendingLootItem{makeLootItem("sword")}
	assert.False(t, instance.LootItemsEqualForTest(a, nil))
}

func TestLootItemsEqual_SameClaimStates(t *testing.T) {
	id := uuid.New()
	item := makeLootItem("sword", charClaim(id, instancestate.LootClaimStateAvailable))
	a := []instancestate.PendingLootItem{item}
	b := []instancestate.PendingLootItem{item}
	assert.True(t, instance.LootItemsEqualForTest(a, b))
}

func TestLootItemsEqual_DifferentClaimState(t *testing.T) {
	id := uuid.New()
	claimID := uuid.New()
	a := []instancestate.PendingLootItem{{
		ClaimID: claimID,
		Item:    instanceconfig.Item{Identifier: "sword"},
		Claims:  []instancestate.CharacterLootClaim{charClaim(id, instancestate.LootClaimStateAvailable)},
	}}
	b := []instancestate.PendingLootItem{{
		ClaimID: claimID,
		Item:    instanceconfig.Item{Identifier: "sword"},
		Claims:  []instancestate.CharacterLootClaim{charClaim(id, instancestate.LootClaimStateLocked)},
	}}
	assert.False(t, instance.LootItemsEqualForTest(a, b))
}

// ---------------------------------------------------------------------------
// lootItemsToJSON - includes claims
// ---------------------------------------------------------------------------

func TestLootItemsToJSON_IncludesClaims(t *testing.T) {
	char := uuid.New()
	items := []instancestate.PendingLootItem{
		makeLootItem("sword", charClaim(char, instancestate.LootClaimStateAvailable)),
	}

	raw := instance.LootItemsToJSONForTest(items)
	var out []map[string]any
	require.NoError(t, json.Unmarshal(raw, &out))
	require.Len(t, out, 1)

	claims := out[0]["claims"].([]any)
	require.Len(t, claims, 1)
	claim := claims[0].(map[string]any)
	assert.Equal(t, char.String(), claim["character_unit_id"])
	assert.Equal(t, "available", claim["state"])
}

func TestLootItemsToJSON_IncludesDescriptionAndStats(t *testing.T) {
	items := []instancestate.PendingLootItem{
		{
			ClaimID: uuid.New(),
			Item: instanceconfig.Item{
				Identifier:  "sword",
				Name:        "sword",
				Slot:        "head",
				Ilvl:        100,
				Description: "A sharp blade.",
				Stats:       instanceconfig.ItemStats{Strength: 5, CritRating: 3},
			},
		},
	}

	raw := instance.LootItemsToJSONForTest(items)
	var out []map[string]any
	require.NoError(t, json.Unmarshal(raw, &out))
	require.Len(t, out, 1)

	assert.Equal(t, "A sharp blade.", out[0]["description"])
	stats := out[0]["stats"].(map[string]any)
	assert.Equal(t, float64(5), stats["strength"])
	assert.Equal(t, float64(3), stats["crit_rating"])
}

func TestLootItemsToJSON_EmptyItems(t *testing.T) {
	raw := instance.LootItemsToJSONForTest(nil)
	assert.Equal(t, []byte("null"), raw)
}

func TestLootItemsToJSON_MultipleClaimsAndItems(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	items := []instancestate.PendingLootItem{
		makeLootItem("sword",
			charClaim(a, instancestate.LootClaimStateAvailable),
			charClaim(b, instancestate.LootClaimStateOwned),
		),
		makeLootItem("helm",
			charClaim(a, instancestate.LootClaimStateUpgrade),
		),
	}

	raw := instance.LootItemsToJSONForTest(items)
	var out []map[string]any
	require.NoError(t, json.Unmarshal(raw, &out))
	require.Len(t, out, 2)
	assert.Len(t, out[0]["claims"].([]any), 2)
	assert.Len(t, out[1]["claims"].([]any), 1)
}
