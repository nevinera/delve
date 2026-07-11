package instance

import (
	"context"
	"log/slog"
	"math"
	"strings"

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
				pos = entryPosition(inst.ZoneConfig, m)
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
				SpawnMapIdentifier:  mapID,
				Health:              playerBaseMaxHP,
				MaxHealth:           playerBaseMaxHP,
				Resource:            resource,
				MaxResource:         maxResource,
				Speed:               BasePlayerSpeed,
				Radius:              BasePlayerRadius,
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

// entryPosition returns the spawn position for the first entry point found on
// the map, falling back to the map center. Mirrors the entryPosition function
// in tools/demo.html.
func entryPosition(zone instanceconfig.Zone, m instanceconfig.Map) instanceconfig.Position {
	center := instanceconfig.Position{
		X: m.FeetDimensions.Width / 2,
		Y: m.FeetDimensions.Height / 2,
	}

	prefix := m.Identifier + "/"
	var connID string
	for key := range zone.EntryPoints {
		if strings.HasPrefix(key, prefix) {
			connID = strings.TrimPrefix(key, prefix)
			break
		}
	}
	if connID == "" {
		return center
	}

	var conn *instanceconfig.MapConnection
	for i := range m.Connections {
		if m.Connections[i].Identifier == connID {
			conn = &m.Connections[i]
			break
		}
	}
	if conn == nil {
		return center
	}

	switch conn.Type {
	case "point":
		if conn.Position != nil {
			return *conn.Position
		}
	case "line":
		if conn.Start != nil && conn.End != nil {
			mx := (conn.Start.X + conn.End.X) / 2
			my := (conn.Start.Y + conn.End.Y) / 2
			// nudge 4 feet toward map center so the token starts inside
			dx := m.FeetDimensions.Width/2 - mx
			dy := m.FeetDimensions.Height/2 - my
			dist := math.Sqrt(dx*dx + dy*dy)
			if dist > 0 {
				mx += (dx / dist) * 4
				my += (dy / dist) * 4
			}
			return instanceconfig.Position{X: mx, Y: my}
		}
	}

	return center
}
