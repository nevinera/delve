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
	ZoneUnitIdentifier     string                   `json:"zone_unit_identifier"`
	UnitTypeIdentifier     string                   `json:"unit_type_identifier,omitempty"`
	MapIdentifier          string                   `json:"map_identifier"`
	Hostility              string                   `json:"hostility,omitempty"`
	Position               instanceconfig.Position  `json:"position"`
	Health                 float64                  `json:"health"`
	MaxHealth              float64                  `json:"max_health"`
	Resource               float64                  `json:"resource"`
	MaxResource            float64                  `json:"max_resource"`
	Speed                  float64                  `json:"speed"`
	Radius                 float64                  `json:"radius"`
	Status                 instancestate.UnitStatus `json:"status"`
	Target                 *string                  `json:"target"`
	GlobalCooldownEndsAt   *int64                   `json:"global_cooldown_ends_at,omitempty"`
	PowerCooldowns         map[string]int64         `json:"power_cooldowns,omitempty"`
	ActiveStatusEffects    []effectJSON             `json:"active_status_effects"`
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

type combatEventJSON struct {
	AttackerID string `json:"attacker_id"`
	TargetID   string `json:"target_id"`
	PowerName  string `json:"power_name"`
}

type deltaMsg struct {
	downBase
	UnitUpdates   map[string]map[string]any `json:"unit_updates"`
	UnitRemovals  []string                  `json:"unit_removals"`
	EffectAdds    []effectAddJSON           `json:"effect_adds"`
	EffectRemoves []effectRemoveJSON        `json:"effect_removes"`
	CombatEvents  []combatEventJSON         `json:"combat_events,omitempty"`
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
		var gcdMs *int64
		if !u.GlobalCooldownEndsAt.IsZero() {
			ms := u.GlobalCooldownEndsAt.UnixMilli()
			gcdMs = &ms
		}
		units[id.String()] = unitJSON{
			ZoneUnitIdentifier:   u.ZoneUnitIdentifier,
			UnitTypeIdentifier:   u.UnitTypeIdentifier,
			MapIdentifier:        u.MapIdentifier,
			Hostility:            u.Hostility,
			Position:             u.Position,
			Health:               u.Health,
			MaxHealth:            u.MaxHealth,
			Resource:             u.Resource,
			MaxResource:          u.MaxResource,
			Speed:                u.Speed,
			Radius:               u.Radius,
			Status:               u.Status,
			Target:               target,
			GlobalCooldownEndsAt: gcdMs,
			PowerCooldowns:       powerCooldownsJSON(u.PowerCooldowns),
			ActiveStatusEffects:  effects,
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

func buildDeltaMsg(prev, curr *instancestate.InstanceState, events []CombatEvent, now time.Time, checksum string) ([]byte, error) {
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
			update := map[string]any{
				"zone_unit_identifier": cu.ZoneUnitIdentifier,
				"unit_type_identifier": cu.UnitTypeIdentifier,
				"map_identifier":       cu.MapIdentifier,
				"hostility":            cu.Hostility,
				"position":             cu.Position,
				"health":               cu.Health,
				"max_health":           cu.MaxHealth,
				"resource":             cu.Resource,
				"max_resource":         cu.MaxResource,
				"speed":                cu.Speed,
				"radius":               cu.Radius,
				"status":               string(cu.Status),
				"target":               target,
			}
			if !cu.GlobalCooldownEndsAt.IsZero() {
				update["global_cooldown_ends_at"] = cu.GlobalCooldownEndsAt.UnixMilli()
			}
			if pcd := powerCooldownsJSON(cu.PowerCooldowns); pcd != nil {
				update["power_cooldowns"] = pcd
			}
			msg.UnitUpdates[idStr] = update
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
		if cu.Speed != pu.Speed {
			patch["speed"] = cu.Speed
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
		if cu.GlobalCooldownEndsAt != pu.GlobalCooldownEndsAt {
			patch["global_cooldown_ends_at"] = cu.GlobalCooldownEndsAt.UnixMilli()
		}
		if !powerCooldownsEqual(cu.PowerCooldowns, pu.PowerCooldowns) {
			patch["power_cooldowns"] = powerCooldownsJSON(cu.PowerCooldowns)
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

	for _, ev := range events {
		msg.CombatEvents = append(msg.CombatEvents, combatEventJSON{
			AttackerID: ev.AttackerID,
			TargetID:   ev.TargetID,
			PowerName:  ev.PowerName,
		})
	}

	return json.Marshal(msg)
}

// powerCooldownsJSON converts a PowerCooldowns map to epoch-ms int64 values,
// omitting zero times. Returns nil when the map is empty.
func powerCooldownsJSON(m map[string]time.Time) map[string]int64 {
	if len(m) == 0 {
		return nil
	}
	out := make(map[string]int64, len(m))
	for k, v := range m {
		if !v.IsZero() {
			out[k] = v.UnixMilli()
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// powerCooldownsEqual reports whether two PowerCooldowns maps are identical.
func powerCooldownsEqual(a, b map[string]time.Time) bool {
	if len(a) != len(b) {
		return false
	}
	for k, va := range a {
		if vb, ok := b[k]; !ok || va != vb {
			return false
		}
	}
	return true
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
