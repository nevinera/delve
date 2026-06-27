package instance

import (
	"context"
	"log/slog"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

const (
	playerBaseMaxHP       = 100.0
	playerBaseMaxResource = 100.0
	playerBaseResource    = 0.0
)

type playerSpawn struct {
	unitID        uuid.UUID
	characterName string
	class         instanceconfig.CharacterClass
}

// drainPlayerSpawns processes all pending player spawn requests. Called at the
// start of each tick so spawned units are included in that tick's state snapshot.
func (inst *Instance) drainPlayerSpawns(ctx context.Context, state *instancestate.InstanceState) {
	for {
		select {
		case spawn := <-inst.playerSpawnCh:
			if _, exists := state.Units[spawn.unitID]; exists {
				continue // reconnect: unit already present
			}
			pos := instanceconfig.Position{}
			mapID := ""
			if len(inst.ZoneConfig.Maps) > 0 {
				m := inst.ZoneConfig.Maps[0]
				mapID = m.Identifier
				pos = instanceconfig.Position{
					X:     m.FeetDimensions.Width / 2,
					Y:     m.FeetDimensions.Height / 2,
					Angle: 0,
				}
			}
			maxResource := playerBaseMaxResource
			resource := playerBaseResource
			if len(spawn.class.Resources) > 0 {
				r := spawn.class.Resources[0]
				maxResource = r.Max
				resource = r.DefaultValue
			}
			state.Units[spawn.unitID] = &instancestate.UnitState{
				ZoneUnitIdentifier:  "player:" + spawn.characterName,
				UnitTypeIdentifier:  "",
				MapIdentifier:       mapID,
				Position:            pos,
				SpawnPoint:          pos,
				Health:              playerBaseMaxHP,
				MaxHealth:           playerBaseMaxHP,
				Resource:            resource,
				MaxResource:         maxResource,
				Status:              instancestate.UnitStatusIdle,
				ActiveStatusEffects: []instancestate.ActiveStatusEffect{},
			}
			slog.InfoContext(ctx, "player unit spawned",
				"unit_id", spawn.unitID,
				"character", spawn.characterName,
				"map", mapID,
				"x", pos.X,
				"y", pos.Y,
			)
		default:
			return
		}
	}
}
