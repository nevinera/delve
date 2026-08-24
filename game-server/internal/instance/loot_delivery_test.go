package instance_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// zoneWithLootableTarget returns a zone with one hostile, stationary,
// one-HP unit carrying a lootTable, plus the item it can drop.
func zoneWithLootableTarget() instanceconfig.Zone {
	lootCount := instanceconfig.ValueRange{1, 1}
	return instanceconfig.Zone{
		Name:    "Loot Test Zone",
		Private: true,
		UnitTypes: map[string]instanceconfig.UnitType{
			"grunt": {
				Name:        "Grunt",
				TokenRadius: 2.0,
				MaxHP:       1,
				Resource:    instanceconfig.ResourceType{Name: "energy", Max: 100, DefaultValue: 100, IsFluid: true},
				Targeting:   instanceconfig.UnitTargeting{Type: "aggroTable"},
				Tactics:     instanceconfig.UnitTactics{Type: "randomAvailable"},
			},
		},
		Items: map[string]instanceconfig.Item{
			"test-trinket": {Identifier: "test-trinket", Name: "Test Trinket", Slot: "trinket", Ilvl: 1},
		},
		Maps: []instanceconfig.Map{{
			Identifier:     "m1",
			Name:           "Map 1",
			FeetDimensions: instanceconfig.Dimensions{Width: 100, Height: 100},
			Units: []instanceconfig.Unit{{
				UnitType:   "grunt",
				Identifier: "grunt_1",
				Hostility:  "hostile",
				// Map center (where the player spawns, absent entry points) is
				// (50,50); keep the target within the harm effect's default
				// 5ft range so the test doesn't need to fuss with facing/movement.
				Position:  instanceconfig.Position{X: 52, Y: 50, Angle: 0},
				Movement:  instanceconfig.UnitMovement{Type: "still"},
				LootTable: map[string]int{"test-trinket": 100},
				LootCount: &lootCount,
			}},
		}},
	}
}

// lethalPower is a frontal-check-free, out-of-cooldown power that always
// deals far more damage than the target's 1 HP.
func lethalPower() instanceconfig.Power {
	amount := instanceconfig.ValueRange{1000.0, 1000.0}
	frontal := false
	return instanceconfig.Power{
		Name:           "Smite",
		GlobalCooldown: 0.1,
		Frontal:        &frontal,
		Effects: []instanceconfig.PowerEffect{
			{Type: "harm", Affects: "bTarget", Amount: &amount},
		},
	}
}

type testLootClaim struct {
	CharacterUnitID string `json:"character_unit_id"`
	State           string `json:"state"`
}

type testLootItem struct {
	Claims []testLootClaim `json:"claims"`
}

type testUnit struct {
	LootItems []testLootItem `json:"loot_items"`
}

type testMsg struct {
	Type        string              `json:"type"`
	Units       map[string]testUnit `json:"units"`        // full state
	UnitUpdates map[string]testUnit `json:"unit_updates"` // delta
}

// findClaims extracts the loot claims for targetID from a full-state or
// delta message, if that unit's loot_items were included in this message.
func findClaims(t *testing.T, raw []byte, targetID string) ([]testLootClaim, bool) {
	t.Helper()
	var msg testMsg
	require.NoError(t, json.Unmarshal(raw, &msg))

	var unit testUnit
	var ok bool
	switch msg.Type {
	case "instance-state":
		unit, ok = msg.Units[targetID]
	case "delta":
		unit, ok = msg.UnitUpdates[targetID]
	}
	if !ok || len(unit.LootItems) == 0 {
		return nil, false
	}
	return unit.LootItems[0].Claims, true
}

// TestKillDelivery_LootClaimsArrivePromptly is a regression test for a bug
// where Instance.processLootEvents ran after that tick's outgoing message
// was already built, so the kill-tick message carried loot_items with empty
// claims - and because prevState was cloned *after* processLootEvents ran,
// the delta-diff on every later tick saw no change and never resent it,
// permanently starving the killer's client of a lootable claim.
func TestKillDelivery_LootClaimsArrivePromptly(t *testing.T) {
	reg := instance.NewRegistry()
	inst := instance.NewInstance(
		uuid.New(), "db-1", "zone-loot-test", "v1", "http://x",
		zoneWithLootableTarget(),
		instance.DefaultMaxSlots,
	)
	require.NoError(t, inst.Start(reg))
	t.Cleanup(inst.Stop)
	reg.Add(inst)

	slot, err := inst.AddSlot("Aldric", "42", puncherClass, nil, nil)
	require.NoError(t, err)

	writeCh, _, done, ok := inst.ConnectSlot(slot.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(done) })

	units := receiveFullState(t, writeCh)
	var targetID string
	for id, u := range units {
		if u["zone_unit_identifier"] == "grunt_1" {
			targetID = id
		}
	}
	require.NotEmpty(t, targetID, "target unit should appear in full state")
	targetUUID, err := uuid.Parse(targetID)
	require.NoError(t, err)

	inst.SendCommand(command.Command{
		UnitID:     slot.CharacterUnitID,
		ReceivedAt: time.Now(),
		Payload:    command.TargetPayload{TargetID: &targetUUID},
	})
	inst.SendCommand(command.Command{
		UnitID:     slot.CharacterUnitID,
		ReceivedAt: time.Now(),
		Payload:    command.UsePowerPayload{Power: lethalPower()},
	})

	selfUnitID := slot.CharacterUnitID.String()
	deadline := time.After(2 * time.Second)
	for {
		select {
		case msg := <-writeCh:
			claims, found := findClaims(t, msg, targetID)
			if !found {
				continue
			}
			for _, c := range claims {
				if c.CharacterUnitID == selfUnitID && c.State == "available" {
					return // success: claim delivered
				}
			}
			t.Fatalf("loot_items for target arrived but without an available claim for the killer: %+v", claims)
		case <-deadline:
			t.Fatal("loot claim for killer never arrived within 2s")
		}
	}
}
