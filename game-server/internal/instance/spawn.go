package instance

import (
	"context"
	"log/slog"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// permanentPassiveDurationSeconds is the "duration" (command.ApplyStatus
// takes seconds) a class passive is applied with - long enough to outlast
// any real instance, reusing the existing ActiveStatusEffect/ExpiresAt
// machinery rather than inventing a separate "never expires" concept.
// Passives must set treatAs: "inherent" (enforced by
// Validators::CharacterClassValidator), which the client's StatusBar never
// renders, so the absurdly long "remaining time" this implies is never
// actually shown to anyone.
const permanentPassiveDurationSeconds float64 = 100 * 365 * 24 * 60 * 60

type playerSpawn struct {
	unitID        uuid.UUID
	characterName string
	class         instanceconfig.CharacterClass
	equippedItems map[string]instanceconfig.EquippedItem
}

// drainPlayerSpawns processes all pending player spawn requests. Called at the
// start of each tick so spawned units are included in that tick's state snapshot.
func (inst *Instance) drainPlayerSpawns(ctx context.Context, state *instancestate.InstanceState, now time.Time) {
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
			resources, primaryResourceName := playerResources(spawn.class)
			unit := &instancestate.UnitState{
				ZoneUnitIdentifier:  "player:" + spawn.characterName,
				UnitTypeIdentifier:  "",
				MapIdentifier:       mapID,
				Position:            pos,
				SpawnPoint:          pos,
				SpawnMapIdentifier:  mapID,
				Resources:           resources,
				PrimaryResourceName: primaryResourceName,
				Speed:               BasePlayerSpeed,
				Radius:              BasePlayerRadius,
				Status:              instancestate.UnitStatusIdle,
				ActiveStatusEffects: []instancestate.ActiveStatusEffect{},
				EquippedItems:       spawn.equippedItems,
				DamageStatKey:       spawn.class.DamageStatKey(),
			}
			// Spawn at full health against the real (Stamina-scaled) cap,
			// not a flat placeholder - updatePlayerMaxHealth keeps this in
			// sync every tick from here on, but a fresh spawn needs it set
			// once up front so it doesn't start under-capped.
			unit.MaxHealth = command.PlayerMaxHealth(unit, inst.ZoneConfig)
			unit.Health = unit.MaxHealth
			state.Units[spawn.unitID] = unit
			applyClassPassives(unit, spawn.unitID, spawn.class, inst.ZoneConfig, now)
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

// playerResources builds the Resources map/PrimaryResourceName pair for a
// freshly spawned player unit from their class's own Resources array
// (docs/schema/character_class.md - every entry, not just the primary one;
// [[character-resources]]/[[character-secondary-resources]]). Empty/"" for a
// class with no resources at all (shouldn't happen once Rails validation
// requires at least one, but the game server doesn't itself re-validate
// content it's handed).
func playerResources(class instanceconfig.CharacterClass) (map[string]*instancestate.ResourceState, string) {
	if len(class.Resources) == 0 {
		return nil, ""
	}
	resources := make(map[string]*instancestate.ResourceState, len(class.Resources))
	for _, r := range class.Resources {
		resources[r.Name] = &instancestate.ResourceState{
			Current:          r.DefaultValue,
			Max:              r.Max,
			DefaultValue:     r.DefaultValue,
			ReturnRate:       r.ReturnRate,
			HasteAffected:    r.HasteAffected,
			RecoveryAffected: r.RecoveryAffected,
		}
	}
	return resources, class.PrimaryResource().Name
}

// applyClassPassives self-applies every passive Status on a freshly spawned
// player's class (docs/schema/character_class.md's passives - hidden,
// permanent buffs), reusing command.ApplyStatus with a duration long enough
// it will never expire within a real instance (see
// permanentPassiveDurationSeconds), rather than a separate "never expires"
// mechanism. unitID doubles as the ApplierID, matching every other
// self-targeted status application (e.g. a power's "status" effect with
// affects: "self").
func applyClassPassives(unit *instancestate.UnitState, unitID uuid.UUID, class instanceconfig.CharacterClass, zone instanceconfig.Zone, now time.Time) {
	for _, passive := range class.Passives {
		command.ApplyStatus(unit, unit, unitID, passive, permanentPassiveDurationSeconds, zone, now)
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
