package instance

import (
	"context"
	"errors"
	"log/slog"

	"github.com/google/uuid"
)

// ErrNoWorldCharacter is returned by the flag calls for a slot with no
// Rails WorldCharacter (a directly played zone): only world characters
// hold flags.
var ErrNoWorldCharacter = errors.New("slot has no world character")

// ErrNoRailsClient is returned when a flag call needs Rails and none is
// configured.
var ErrNoRailsClient = errors.New("no Rails client configured")

// errSlotGone is returned by the flag calls for an unknown slot.
var errSlotGone = errors.New("slot not found")

// initialFlags is a new slot's flag cache (see plans/flags.md): every flag
// the zone preloads, held or not, with heldFlags (the ones Rails says the
// character holds) marked held.
func (inst *Instance) initialFlags(heldFlags []string) map[string]bool {
	flags := make(map[string]bool, len(inst.ZoneConfig.Flags)+len(heldFlags))
	for _, flag := range inst.ZoneConfig.Flags {
		flags[flag] = false
	}
	for _, flag := range heldFlags {
		flags[flag] = true
	}
	return flags
}

// HasFlag reports whether the character in slotID holds flag
// ("type/identifier"). Answers from the slot's cache when it can, otherwise
// asks Rails and caches the answer. May call Rails, so never from the tick
// loop.
func (inst *Instance) HasFlag(slotID uuid.UUID, flag string) (bool, error) {
	worldCharacterID, held, known, err := inst.cachedFlag(slotID, flag)
	if err != nil || known {
		return held, err
	}
	if inst.RailsClient == nil {
		return false, ErrNoRailsClient
	}
	held, err = inst.RailsClient.HasFlag(worldCharacterID, flag)
	if err != nil {
		return false, err
	}
	inst.cacheFlag(slotID, flag, held)
	return held, nil
}

// GrantFlag grants the character in slotID flag, through Rails, and marks
// it held in the slot's cache. A no-op when the cache already has it held.
// Calls Rails, so never from the tick loop.
func (inst *Instance) GrantFlag(slotID uuid.UUID, flag string) error {
	worldCharacterID, held, _, err := inst.cachedFlag(slotID, flag)
	if err != nil || held {
		return err
	}
	if inst.RailsClient == nil {
		return ErrNoRailsClient
	}
	if err := inst.RailsClient.GrantFlag(worldCharacterID, flag); err != nil {
		return err
	}
	inst.cacheFlag(slotID, flag, true)
	return nil
}

// cachedFlag returns the slot's world character and what its cache knows
// of flag.
func (inst *Instance) cachedFlag(slotID uuid.UUID, flag string) (worldCharacterID string, held, known bool, err error) {
	inst.slotsMu.RLock()
	defer inst.slotsMu.RUnlock()
	slot, ok := inst.slots[slotID]
	if !ok {
		return "", false, false, errSlotGone
	}
	if slot.WorldCharacterDatabaseID == "" {
		return "", false, false, ErrNoWorldCharacter
	}
	held, known = slot.Flags[flag]
	return slot.WorldCharacterDatabaseID, held, known, nil
}

// cacheFlag records what's now known of flag for the slot. A no-op if the
// slot is gone.
func (inst *Instance) cacheFlag(slotID uuid.UUID, flag string, held bool) {
	inst.slotsMu.Lock()
	defer inst.slotsMu.Unlock()
	slot, ok := inst.slots[slotID]
	if !ok {
		return
	}
	if slot.Flags == nil {
		slot.Flags = make(map[string]bool)
	}
	slot.Flags[flag] = held
}

// ZoneReachedFlag is the flag every world character gets on connecting to
// a zone.
func (inst *Instance) ZoneReachedFlag() string { return "zone/reached/" + inst.ZoneIdentifier }

// GrantZoneReached grants the character in slotID the zone's reached flag,
// logging any failure. A no-op for a slot with no world character. Calls
// Rails, so run it in its own goroutine.
func (inst *Instance) GrantZoneReached(ctx context.Context, slotID uuid.UUID) {
	err := inst.GrantFlag(slotID, inst.ZoneReachedFlag())
	if err != nil && !errors.Is(err, ErrNoWorldCharacter) {
		slog.WarnContext(ctx, "failed to grant zone reached flag", "error", err, "zone", inst.ZoneIdentifier)
	}
}
