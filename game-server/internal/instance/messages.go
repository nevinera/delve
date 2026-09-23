package instance

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
	"github.com/delve-mmo/game-server/internal/itemstats"
)

// downBase is embedded in every server→client message.
type downBase struct {
	Direction string `json:"direction"`
	Type      string `json:"type"`
	Timestamp int64  `json:"timestamp"` // epoch milliseconds
	Checksum  string `json:"checksum"`
}

type resourceJSON struct {
	Current float64 `json:"current"`
	Max     float64 `json:"max"`
}

func resourcesJSON(resources map[string]*instancestate.ResourceState) map[string]resourceJSON {
	out := make(map[string]resourceJSON, len(resources))
	for name, r := range resources {
		out[name] = resourceJSON{Current: r.Current, Max: r.Max}
	}
	return out
}

// resourcesEqual reports whether two units' resource maps have the same set
// of names with the same current/max values - used to decide whether a
// delta patch needs to resend the (whole) resources map for a unit.
func resourcesEqual(a, b map[string]*instancestate.ResourceState) bool {
	if len(a) != len(b) {
		return false
	}
	for name, ar := range a {
		br, ok := b[name]
		if !ok || ar.Current != br.Current || ar.Max != br.Max {
			return false
		}
	}
	return true
}

type unitJSON struct {
	ZoneUnitIdentifier   string                   `json:"zone_unit_identifier"`
	UnitTypeIdentifier   string                   `json:"unit_type_identifier,omitempty"`
	MapIdentifier        string                   `json:"map_identifier"`
	Hostility            string                   `json:"hostility,omitempty"`
	Position             instanceconfig.Position  `json:"position"`
	Health               float64                  `json:"health"`
	MaxHealth            float64                  `json:"max_health"`
	Resources            map[string]resourceJSON  `json:"resources"`
	Speed                float64                  `json:"speed"`
	Radius               float64                  `json:"radius"`
	Status               instancestate.UnitStatus `json:"status"`
	Target               *string                  `json:"target"`
	Attacking            bool                     `json:"attacking"`
	TaggedBy             *string                  `json:"tagged_by"`
	GlobalCooldownEndsAt *int64                   `json:"global_cooldown_ends_at,omitempty"`
	NextBasicAttackAt    *int64                   `json:"next_basic_attack_at,omitempty"`
	PowerCooldowns       map[string]int64         `json:"power_cooldowns,omitempty"`
	CastingPower         *string                  `json:"casting_power,omitempty"`
	CastStartedAt        *int64                   `json:"cast_started_at,omitempty"`
	CastEndsAt           *int64                   `json:"cast_ends_at,omitempty"`
	ActiveStatusEffects  []effectJSON             `json:"active_status_effects"`
	LootItems            []lootItemJSON           `json:"loot_items,omitempty"`

	// Set only for player-character units with a connected slot that has sent
	// at least one heartbeat/move - see Instance.LastSeqsByUnit. Echoing the
	// client's own seq back lets it match this to exactly the send it
	// answers: for heartbeat, to compute round-trip latency against its own
	// locally-recorded send time; for move, to reconcile its predicted
	// position against the difference between what it sent and what the
	// server actually accepted (see move_feasibility.go).
	LastHeartbeatSeq *string `json:"last_heartbeat_seq,omitempty"`
	LastMoveSeq      *string `json:"last_move_seq,omitempty"`
}

type effectJSON struct {
	StatusName string `json:"status_name"`
	ApplierID  string `json:"applier_id"`
	Stacks     int    `json:"stacks"`
	ExpiresAt  int64  `json:"expires_at"`
}

type fullStateMsg struct {
	downBase
	Units map[string]unitJSON `json:"units"`
}

type effectAddJSON struct {
	UnitID     string `json:"unit_id"`
	StatusName string `json:"status_name"`
	ApplierID  string `json:"applier_id"`
	Stacks     int    `json:"stacks"`
	ExpiresAt  int64  `json:"expires_at"`
}

type effectRemoveJSON struct {
	UnitID     string `json:"unit_id"`
	StatusName string `json:"status_name"`
	ApplierID  string `json:"applier_id"`
}

// effectKey identifies one ActiveStatusEffect for add/remove diffing -
// (Status.Name, ApplierID), see instancestate.ActiveStatusEffect.
type effectKey struct {
	name      string
	applierID string
}

func effectAddFromActive(unitID string, e instancestate.ActiveStatusEffect) effectAddJSON {
	return effectAddJSON{
		UnitID:     unitID,
		StatusName: e.Status.Name,
		ApplierID:  e.ApplierID.String(),
		Stacks:     e.Stacks,
		ExpiresAt:  e.ExpiresAt.UnixMilli(),
	}
}

type combatEventJSON struct {
	AttackerID string `json:"attacker_id"`
	TargetID   string `json:"target_id"`
	PowerName  string `json:"power_name"`
}

type lootEventItemJSON struct {
	Identifier string `json:"identifier"`
	Name       string `json:"name"`
	Slot       string `json:"slot"`
	Elvl       int    `json:"elvl"`
}

type charClaimJSON struct {
	CharacterUnitID string                       `json:"character_unit_id"`
	State           instancestate.LootClaimState `json:"state"`
}

type lootItemJSON struct {
	Identifier  string             `json:"identifier"`
	Name        string             `json:"name"`
	Slot        string             `json:"slot"`
	Elvl        int                `json:"elvl"`
	Description string             `json:"description,omitempty"`
	Stats       map[string]float64 `json:"stats,omitempty"`
	Claims      []charClaimJSON    `json:"claims"`
}

type lootEventJSON struct {
	UnitID string              `json:"unit_id"`
	Items  []lootEventItemJSON `json:"items"`
}

type lootFailureJSON struct {
	ClaimedBy string            `json:"claimed_by"`
	Item      lootEventItemJSON `json:"item"`
}

type deltaMsg struct {
	downBase
	UnitUpdates   map[string]map[string]any `json:"unit_updates"`
	UnitRemovals  []string                  `json:"unit_removals"`
	EffectAdds    []effectAddJSON           `json:"effect_adds"`
	EffectRemoves []effectRemoveJSON        `json:"effect_removes"`
	CombatEvents  []combatEventJSON         `json:"combat_events,omitempty"`
	LootEvents    []lootEventJSON           `json:"loot_events,omitempty"`
	LootFailures  []lootFailureJSON         `json:"loot_failures,omitempty"`
}

func buildFullStateMsg(state *instancestate.InstanceState, now time.Time, checksum string, heartbeatSeqs, moveSeqs map[uuid.UUID]string) ([]byte, error) {
	units := make(map[string]unitJSON, len(state.Units))
	for id, u := range state.Units {
		effects := make([]effectJSON, len(u.ActiveStatusEffects))
		for i, e := range u.ActiveStatusEffects {
			effects[i] = effectJSON{
				StatusName: e.Status.Name,
				ApplierID:  e.ApplierID.String(),
				Stacks:     e.Stacks,
				ExpiresAt:  e.ExpiresAt.UnixMilli(),
			}
		}
		var target *string
		if u.Target != nil {
			s := u.Target.String()
			target = &s
		}
		var taggedBy *string
		if u.TaggedBy != nil {
			s := u.TaggedBy.String()
			taggedBy = &s
		}
		var gcdMs *int64
		if !u.GlobalCooldownEndsAt.IsZero() {
			ms := u.GlobalCooldownEndsAt.UnixMilli()
			gcdMs = &ms
		}
		var nextBasicAttackMs *int64
		if !u.NextBasicAttackAt.IsZero() {
			ms := u.NextBasicAttackAt.UnixMilli()
			nextBasicAttackMs = &ms
		}
		var hbSeq *string
		if seq, ok := heartbeatSeqs[id]; ok {
			hbSeq = &seq
		}
		var moveSeq *string
		if seq, ok := moveSeqs[id]; ok {
			moveSeq = &seq
		}
		castingPower, castStartedAt, castEndsAt := castingJSON(u.Casting)
		units[id.String()] = unitJSON{
			ZoneUnitIdentifier:   u.ZoneUnitIdentifier,
			UnitTypeIdentifier:   u.UnitTypeIdentifier,
			MapIdentifier:        u.MapIdentifier,
			Hostility:            u.Hostility,
			Position:             u.Position,
			Health:               u.Health,
			MaxHealth:            u.MaxHealth,
			Resources:            resourcesJSON(u.Resources),
			Speed:                u.Speed,
			Radius:               u.Radius,
			Status:               u.Status,
			Target:               target,
			Attacking:            u.Attacking,
			TaggedBy:             taggedBy,
			GlobalCooldownEndsAt: gcdMs,
			NextBasicAttackAt:    nextBasicAttackMs,
			PowerCooldowns:       powerCooldownsJSON(u.PowerCooldowns),
			CastingPower:         castingPower,
			CastStartedAt:        castStartedAt,
			CastEndsAt:           castEndsAt,
			ActiveStatusEffects:  effects,
			LootItems:            lootItemsToJSON(u.LootItems),
			LastHeartbeatSeq:     hbSeq,
			LastMoveSeq:          moveSeq,
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

func buildDeltaMsg(prev, curr *instancestate.InstanceState, events []CombatEvent, lootEvents []instancestate.LootEvent, lootFailures []instancestate.LootFailure, now time.Time, checksum string, prevHeartbeatSeqs, currHeartbeatSeqs, prevMoveSeqs, currMoveSeqs map[uuid.UUID]string) ([]byte, error) {
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
			var taggedBy *string
			if cu.TaggedBy != nil {
				s := cu.TaggedBy.String()
				taggedBy = &s
			}
			update := map[string]any{
				"zone_unit_identifier": cu.ZoneUnitIdentifier,
				"unit_type_identifier": cu.UnitTypeIdentifier,
				"map_identifier":       cu.MapIdentifier,
				"hostility":            cu.Hostility,
				"position":             cu.Position,
				"health":               cu.Health,
				"max_health":           cu.MaxHealth,
				"resources":            resourcesJSON(cu.Resources),
				"speed":                cu.Speed,
				"radius":               cu.Radius,
				"status":               string(cu.Status),
				"target":               target,
				"attacking":            cu.Attacking,
				"tagged_by":            taggedBy,
			}
			if !cu.GlobalCooldownEndsAt.IsZero() {
				update["global_cooldown_ends_at"] = cu.GlobalCooldownEndsAt.UnixMilli()
			}
			if !cu.NextBasicAttackAt.IsZero() {
				update["next_basic_attack_at"] = cu.NextBasicAttackAt.UnixMilli()
			}
			if pcd := powerCooldownsJSON(cu.PowerCooldowns); pcd != nil {
				update["power_cooldowns"] = pcd
			}
			if cu.Casting != nil {
				power, startedAt, endsAt := castingJSON(cu.Casting)
				update["casting_power"] = power
				update["cast_started_at"] = startedAt
				update["cast_ends_at"] = endsAt
			}
			if li := lootItemsToJSON(cu.LootItems); li != nil {
				update["loot_items"] = li
			}
			if seq, ok := currHeartbeatSeqs[id]; ok {
				update["last_heartbeat_seq"] = seq
			}
			if seq, ok := currMoveSeqs[id]; ok {
				update["last_move_seq"] = seq
			}
			msg.UnitUpdates[idStr] = update
			for _, e := range cu.ActiveStatusEffects {
				msg.EffectAdds = append(msg.EffectAdds, effectAddFromActive(idStr, e))
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
		if !resourcesEqual(cu.Resources, pu.Resources) {
			patch["resources"] = resourcesJSON(cu.Resources)
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
		if cu.Attacking != pu.Attacking {
			patch["attacking"] = cu.Attacking
		}
		if !uuidPtrEqual(cu.TaggedBy, pu.TaggedBy) {
			if cu.TaggedBy != nil {
				s := cu.TaggedBy.String()
				patch["tagged_by"] = &s
			} else {
				patch["tagged_by"] = nil
			}
		}
		if cu.GlobalCooldownEndsAt != pu.GlobalCooldownEndsAt {
			patch["global_cooldown_ends_at"] = cu.GlobalCooldownEndsAt.UnixMilli()
		}
		if cu.NextBasicAttackAt != pu.NextBasicAttackAt {
			patch["next_basic_attack_at"] = cu.NextBasicAttackAt.UnixMilli()
		}
		if !powerCooldownsEqual(cu.PowerCooldowns, pu.PowerCooldowns) {
			patch["power_cooldowns"] = powerCooldownsJSON(cu.PowerCooldowns)
		}
		if !castStateEqual(cu.Casting, pu.Casting) {
			power, startedAt, endsAt := castingJSON(cu.Casting)
			patch["casting_power"] = power
			patch["cast_started_at"] = startedAt
			patch["cast_ends_at"] = endsAt
		}
		if !lootItemsEqual(cu.LootItems, pu.LootItems) {
			patch["loot_items"] = lootItemsToJSON(cu.LootItems)
		}
		if seq, ok := currHeartbeatSeqs[id]; ok && seq != prevHeartbeatSeqs[id] {
			patch["last_heartbeat_seq"] = seq
		}
		if seq, ok := currMoveSeqs[id]; ok && seq != prevMoveSeqs[id] {
			patch["last_move_seq"] = seq
		}
		if len(patch) > 0 {
			msg.UnitUpdates[idStr] = patch
		}

		// Effects: add/remove by (Status.Name, ApplierID). An add is also
		// resent when an already-present key's value changed (e.g. a
		// re-application extended ExpiresAt or added a stack) - the client
		// treats effect_adds as an upsert by key, not just a new entry.
		prevFX := make(map[effectKey]instancestate.ActiveStatusEffect, len(pu.ActiveStatusEffects))
		for _, e := range pu.ActiveStatusEffects {
			prevFX[effectKey{e.Status.Name, e.ApplierID.String()}] = e
		}
		currFX := make(map[effectKey]instancestate.ActiveStatusEffect, len(cu.ActiveStatusEffects))
		for _, e := range cu.ActiveStatusEffects {
			currFX[effectKey{e.Status.Name, e.ApplierID.String()}] = e
		}
		for key, ce := range currFX {
			if pe, had := prevFX[key]; !had || pe.ExpiresAt != ce.ExpiresAt || pe.Stacks != ce.Stacks {
				msg.EffectAdds = append(msg.EffectAdds, effectAddFromActive(idStr, ce))
			}
		}
		for key := range prevFX {
			if _, has := currFX[key]; !has {
				msg.EffectRemoves = append(msg.EffectRemoves, effectRemoveJSON{
					UnitID: idStr, StatusName: key.name, ApplierID: key.applierID,
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
		msg.CombatEvents = append(msg.CombatEvents, combatEventJSON(ev))
	}

	for _, lev := range lootEvents {
		items := make([]lootEventItemJSON, len(lev.Items))
		for i, it := range lev.Items {
			items[i] = lootEventItemJSON{
				Identifier: it.Identifier,
				Name:       it.Name,
				Slot:       it.Slot,
				Elvl:       it.Elvl,
			}
		}
		msg.LootEvents = append(msg.LootEvents, lootEventJSON{
			UnitID: lev.UnitID,
			Items:  items,
		})
	}

	for _, lf := range lootFailures {
		msg.LootFailures = append(msg.LootFailures, lootFailureJSON{
			ClaimedBy: lf.ClaimedBy.String(),
			Item:      lootEventItemJSON{Identifier: lf.Item.Identifier, Name: lf.Item.Name, Slot: lf.Item.Slot, Elvl: lf.Item.Elvl},
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

// lootItemsToJSON serializes all loot items with their per-character claim states.
func lootItemsToJSON(items []instancestate.PendingLootItem) []lootItemJSON {
	if len(items) == 0 {
		return nil
	}
	out := make([]lootItemJSON, len(items))
	for i, pi := range items {
		claims := make([]charClaimJSON, len(pi.Claims))
		for j, c := range pi.Claims {
			claims[j] = charClaimJSON{
				CharacterUnitID: c.CharacterUnitID.String(),
				State:           c.State,
			}
		}
		out[i] = lootItemJSON{
			Identifier:  pi.Item.Identifier,
			Name:        pi.Item.Name,
			Slot:        pi.Item.Slot,
			Elvl:        pi.Item.Elvl,
			Description: pi.Item.Description,
			Stats: itemstats.Raw(itemstats.Allocation{
				Slot:        pi.Item.Slot,
				Shield:      pi.Item.Shield,
				Primary:     pi.Item.Primary,
				Secondaries: pi.Item.Secondaries,
			}),
			Claims: claims,
		}
	}
	return out
}

// lootItemsEqual reports whether two loot item lists are identical in terms of
// items present and all per-character claim states.
func lootItemsEqual(a, b []instancestate.PendingLootItem) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].ClaimID != b[i].ClaimID {
			return false
		}
		if len(a[i].Claims) != len(b[i].Claims) {
			return false
		}
		statesByID := make(map[uuid.UUID]instancestate.LootClaimState, len(a[i].Claims))
		for _, c := range a[i].Claims {
			statesByID[c.CharacterUnitID] = c.State
		}
		for _, c := range b[i].Claims {
			if statesByID[c.CharacterUnitID] != c.State {
				return false
			}
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

// castingJSON converts a UnitState.Casting into the three wire fields a
// client needs to render a cast bar - all nil when c is nil (not casting).
func castingJSON(c *instancestate.CastState) (power *string, startedAt, endsAt *int64) {
	if c == nil {
		return nil, nil, nil
	}
	name := c.Power.Name
	started := c.StartedAt.UnixMilli()
	ends := c.EndsAt.UnixMilli()
	return &name, &started, &ends
}

// castStateEqual reports whether two casting states represent the same
// in-progress cast - StartedAt uniquely identifies one, so this is also
// false whenever a cast starts, completes, or is cancelled (nil on one
// side), prompting a delta patch either way.
func castStateEqual(a, b *instancestate.CastState) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return a.StartedAt.Equal(b.StartedAt)
}
