package instance

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// downBase is embedded in every server→client message.
type downBase struct {
	Direction string `json:"direction"`
	Type      string `json:"type"`
	Timestamp int64  `json:"timestamp"` // epoch milliseconds
	Checksum  string `json:"checksum"`
}

type unitJSON struct {
	ZoneUnitIdentifier  string                   `json:"zone_unit_identifier"`
	MapIdentifier       string                   `json:"map_identifier"`
	Position            instanceconfig.Position  `json:"position"`
	Health              float64                  `json:"health"`
	MaxHealth           float64                  `json:"max_health"`
	Resource            float64                  `json:"resource"`
	MaxResource         float64                  `json:"max_resource"`
	Status              instancestate.UnitStatus `json:"status"`
	Target              *string                  `json:"target"`
	ActiveStatusEffects []effectJSON             `json:"active_status_effects"`
}

type effectJSON struct {
	StatusIdentifier string `json:"status_identifier"`
	ExpiresAt        int64  `json:"expires_at"`
}

type fullStateMsg struct {
	downBase
	Units map[string]unitJSON `json:"units"`
}

type effectAddJSON struct {
	UnitID           string `json:"unit_id"`
	StatusIdentifier string `json:"status_identifier"`
	ExpiresAt        int64  `json:"expires_at"`
}

type effectRemoveJSON struct {
	UnitID           string `json:"unit_id"`
	StatusIdentifier string `json:"status_identifier"`
}

type deltaMsg struct {
	downBase
	UnitUpdates   map[string]map[string]any `json:"unit_updates"`
	UnitRemovals  []string                  `json:"unit_removals"`
	EffectAdds    []effectAddJSON           `json:"effect_adds"`
	EffectRemoves []effectRemoveJSON        `json:"effect_removes"`
}

func buildFullStateMsg(state *instancestate.InstanceState, now time.Time, checksum string) ([]byte, error) {
	units := make(map[string]unitJSON, len(state.Units))
	for id, u := range state.Units {
		effects := make([]effectJSON, len(u.ActiveStatusEffects))
		for i, e := range u.ActiveStatusEffects {
			effects[i] = effectJSON{
				StatusIdentifier: e.StatusIdentifier,
				ExpiresAt:        e.ExpiresAt.UnixMilli(),
			}
		}
		var target *string
		if u.Target != nil {
			s := u.Target.String()
			target = &s
		}
		units[id.String()] = unitJSON{
			ZoneUnitIdentifier:  u.ZoneUnitIdentifier,
			MapIdentifier:       u.MapIdentifier,
			Position:            u.Position,
			Health:              u.Health,
			MaxHealth:           u.MaxHealth,
			Resource:            u.Resource,
			MaxResource:         u.MaxResource,
			Status:              u.Status,
			Target:              target,
			ActiveStatusEffects: effects,
		}
	}
	return json.Marshal(fullStateMsg{
		downBase: downBase{
			Direction: "down",
			Type:      "instance-state",
			Timestamp: now.UnixMilli(),
			Checksum:  checksum,
		},
		Units: units,
	})
}

func buildDeltaMsg(prev, curr *instancestate.InstanceState, now time.Time, checksum string) ([]byte, error) {
	msg := deltaMsg{
		downBase: downBase{
			Direction: "down",
			Type:      "delta",
			Timestamp: now.UnixMilli(),
			Checksum:  checksum,
		},
		UnitUpdates:   make(map[string]map[string]any),
		UnitRemovals:  []string{},
		EffectAdds:    []effectAddJSON{},
		EffectRemoves: []effectRemoveJSON{},
	}

	for id, cu := range curr.Units {
		idStr := id.String()
		pu, existed := prev.Units[id]

		if !existed {
			// New unit: include all fields.
			var target *string
			if cu.Target != nil {
				s := cu.Target.String()
				target = &s
			}
			msg.UnitUpdates[idStr] = map[string]any{
				"zone_unit_identifier": cu.ZoneUnitIdentifier,
				"map_identifier":       cu.MapIdentifier,
				"position":             cu.Position,
				"health":               cu.Health,
				"max_health":           cu.MaxHealth,
				"resource":             cu.Resource,
				"max_resource":         cu.MaxResource,
				"status":               string(cu.Status),
				"target":               target,
			}
			for _, e := range cu.ActiveStatusEffects {
				msg.EffectAdds = append(msg.EffectAdds, effectAddJSON{
					UnitID:           idStr,
					StatusIdentifier: e.StatusIdentifier,
					ExpiresAt:        e.ExpiresAt.UnixMilli(),
				})
			}
			continue
		}

		// Existing unit: include only changed fields.
		patch := make(map[string]any)
		if cu.MapIdentifier != pu.MapIdentifier {
			patch["map_identifier"] = cu.MapIdentifier
		}
		if cu.Position != pu.Position {
			patch["position"] = cu.Position
		}
		if cu.Health != pu.Health {
			patch["health"] = cu.Health
		}
		if cu.MaxHealth != pu.MaxHealth {
			patch["max_health"] = cu.MaxHealth
		}
		if cu.Resource != pu.Resource {
			patch["resource"] = cu.Resource
		}
		if cu.MaxResource != pu.MaxResource {
			patch["max_resource"] = cu.MaxResource
		}
		if cu.Status != pu.Status {
			patch["status"] = string(cu.Status)
		}
		if !uuidPtrEqual(cu.Target, pu.Target) {
			if cu.Target != nil {
				s := cu.Target.String()
				patch["target"] = &s
			} else {
				patch["target"] = nil
			}
		}
		if len(patch) > 0 {
			msg.UnitUpdates[idStr] = patch
		}

		// Effects: add/remove by StatusIdentifier.
		prevFX := make(map[string]instancestate.ActiveStatusEffect, len(pu.ActiveStatusEffects))
		for _, e := range pu.ActiveStatusEffects {
			prevFX[e.StatusIdentifier] = e
		}
		currFX := make(map[string]instancestate.ActiveStatusEffect, len(cu.ActiveStatusEffects))
		for _, e := range cu.ActiveStatusEffects {
			currFX[e.StatusIdentifier] = e
		}
		for sid, ce := range currFX {
			if _, had := prevFX[sid]; !had {
				msg.EffectAdds = append(msg.EffectAdds, effectAddJSON{
					UnitID: idStr, StatusIdentifier: sid, ExpiresAt: ce.ExpiresAt.UnixMilli(),
				})
			}
		}
		for sid := range prevFX {
			if _, has := currFX[sid]; !has {
				msg.EffectRemoves = append(msg.EffectRemoves, effectRemoveJSON{
					UnitID: idStr, StatusIdentifier: sid,
				})
			}
		}
	}

	for id := range prev.Units {
		if _, ok := curr.Units[id]; !ok {
			msg.UnitRemovals = append(msg.UnitRemovals, id.String())
		}
	}

	return json.Marshal(msg)
}

func uuidPtrEqual(a, b *uuid.UUID) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}
