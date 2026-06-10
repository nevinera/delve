package instance

import (
	"errors"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// ErrInstanceFull is returned by AddSlot when the instance has no remaining
// slot capacity.
var ErrInstanceFull = errors.New("instance is at max slot capacity")

// SlotState is the lifecycle state of an InstanceSlot.
type SlotState string

const (
	// SlotStatePending is the initial state: the slot has been created but the
	// websocket goroutine is not yet ready to accept connections.
	SlotStatePending SlotState = "pending"

	// SlotStateAvailable means the websocket goroutine is running and the slot
	// is ready for a client to connect.
	SlotStateAvailable SlotState = "available"

	// SlotStateConnected means a client is actively connected via websocket.
	SlotStateConnected SlotState = "connected"

	// SlotStateWaiting means the client disconnected or missed a heartbeat;
	// the slot is holding state and will accept a reconnect.
	SlotStateWaiting SlotState = "waiting"
)

// InstanceSlot is a reserved place in an instance for one player character.
// The Token is a secret issued on creation; the client uses it to authenticate
// its websocket connection.
type InstanceSlot struct {
	ID             uuid.UUID
	Token          uuid.UUID
	State          SlotState
	CharacterName  string
	CharacterClass instanceconfig.CharacterClass
}

// AddSlot creates a new slot for the named character and adds it to the
// instance. Returns ErrInstanceFull if MaxSlots has been reached.
func (inst *Instance) AddSlot(characterName string, class instanceconfig.CharacterClass) (*InstanceSlot, error) {
	inst.slotsMu.Lock()
	defer inst.slotsMu.Unlock()

	if len(inst.slots) >= inst.MaxSlots {
		return nil, ErrInstanceFull
	}

	slot := &InstanceSlot{
		ID:             uuid.New(),
		Token:          uuid.New(),
		State:          SlotStatePending,
		CharacterName:  characterName,
		CharacterClass: class,
	}
	inst.slots[slot.ID] = slot
	return slot, nil
}

// GetSlot returns the slot with the given ID, or (nil, false) if not found.
func (inst *Instance) GetSlot(id uuid.UUID) (*InstanceSlot, bool) {
	inst.slotsMu.RLock()
	defer inst.slotsMu.RUnlock()
	slot, ok := inst.slots[id]
	return slot, ok
}

// RemoveSlot removes the slot with the given ID. Returns true if it existed.
func (inst *Instance) RemoveSlot(id uuid.UUID) bool {
	inst.slotsMu.Lock()
	defer inst.slotsMu.Unlock()
	_, ok := inst.slots[id]
	delete(inst.slots, id)
	return ok
}

// ListSlots returns a snapshot of all current slots in unspecified order.
func (inst *Instance) ListSlots() []*InstanceSlot {
	inst.slotsMu.RLock()
	defer inst.slotsMu.RUnlock()
	result := make([]*InstanceSlot, 0, len(inst.slots))
	for _, s := range inst.slots {
		result = append(result, s)
	}
	return result
}
