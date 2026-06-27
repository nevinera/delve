package instance

import (
	"context"
	"errors"
	"time"

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
	ID              uuid.UUID
	Token           uuid.UUID
	CharacterUnitID uuid.UUID
	State           SlotState
	CharacterName   string
	CharacterClass  instanceconfig.CharacterClass

	// Connection fields; protected by the instance's slotsMu.
	writeCh        chan []byte         // pre-encoded JSON messages from the tick loop
	connCancel     context.CancelFunc // cancels the active connection's context
	connDone       chan struct{}       // closed by the handler when its goroutines have all exited
	needsFullState bool               // true until the tick loop sends the first full-state message
	stateEnteredAt time.Time          // when the slot entered its current state
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
		ID:              uuid.New(),
		Token:           uuid.New(),
		CharacterUnitID: uuid.New(),
		State:           SlotStatePending,
		CharacterName:   characterName,
		CharacterClass: class,
		stateEnteredAt: time.Now(),
	}
	inst.slots[slot.ID] = slot
	inst.recomputeSlotCounts()
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
	inst.recomputeSlotCounts()
	return ok
}

// SetSlotState transitions a slot to a new state. Returns false if the slot
// does not exist.
func (inst *Instance) SetSlotState(id uuid.UUID, state SlotState) bool {
	inst.slotsMu.Lock()
	defer inst.slotsMu.Unlock()
	slot, ok := inst.slots[id]
	if !ok {
		return false
	}
	slot.State = state
	inst.recomputeSlotCounts()
	return true
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

// SlotCounts returns the total number of slots and the number in the
// connected state. Reads atomics - no lock needed.
func (inst *Instance) SlotCounts() (total, active int) {
	return int(inst.atomicSlotCount.Load()), int(inst.atomicActiveSlotCount.Load())
}

// ConnectSlot prepares a slot for a new WebSocket connection. If the slot
// already has an active connection, its context is cancelled and we wait for
// the old handler goroutines to exit before returning.
//
// Returns (writeCh, ctx, done, true) on success. The caller must run its
// goroutines using ctx for cancellation and close done exactly once when all
// goroutines have exited.
//
// Returns (nil, nil, nil, false) if the slot does not exist.
func (inst *Instance) ConnectSlot(id uuid.UUID) (chan []byte, context.Context, chan struct{}, bool) {
	// Phase 1: snapshot existing connection signals under the lock.
	inst.slotsMu.Lock()
	slot, ok := inst.slots[id]
	if !ok {
		inst.slotsMu.Unlock()
		return nil, nil, nil, false
	}
	oldCancel := slot.connCancel
	oldDone := slot.connDone
	inst.slotsMu.Unlock()

	// Phase 2: cancel and drain the old connection outside the lock so the
	// old handler goroutine can call DisconnectSlot without deadlocking.
	if oldCancel != nil {
		oldCancel()
		<-oldDone
	}

	// Phase 3: install the new connection under the lock.
	ctx, cancel := context.WithCancel(context.Background())
	writeCh := make(chan []byte, 64)
	done := make(chan struct{})

	inst.slotsMu.Lock()
	defer inst.slotsMu.Unlock()
	slot, ok = inst.slots[id]
	if !ok {
		// Slot was removed between phase 1 and phase 3.
		cancel()
		return nil, nil, nil, false
	}
	slot.connCancel = cancel
	slot.connDone = done
	slot.writeCh = writeCh
	slot.needsFullState = true
	slot.State = SlotStateConnected
	slot.stateEnteredAt = time.Now()
	inst.recomputeSlotCounts()
	select {
	case inst.playerSpawnCh <- playerSpawn{
		unitID:        slot.CharacterUnitID,
		characterName: slot.CharacterName,
		class:         slot.CharacterClass,
	}:
	default:
	}
	return writeCh, ctx, done, true
}

// DisconnectSlot transitions the slot to SlotStateWaiting, indicating the
// client disconnected or its heartbeat timed out. Called by the Connect handler
// before it closes done.
func (inst *Instance) DisconnectSlot(id uuid.UUID) {
	inst.slotsMu.Lock()
	defer inst.slotsMu.Unlock()
	slot, ok := inst.slots[id]
	if !ok {
		return
	}
	if slot.State == SlotStateConnected {
		slot.State = SlotStateWaiting
		slot.stateEnteredAt = time.Now()
		inst.recomputeSlotCounts()
	}
}

// SlotForTick carries the data the tick loop needs for one connected slot.
type SlotForTick struct {
	WriteCh        chan []byte
	NeedsFullState bool
}

// SlotsForTick returns one SlotForTick per connected slot and atomically
// clears the needsFullState flag so subsequent ticks produce deltas.
func (inst *Instance) SlotsForTick() []SlotForTick {
	inst.slotsMu.Lock()
	defer inst.slotsMu.Unlock()
	var result []SlotForTick
	for _, s := range inst.slots {
		if s.State != SlotStateConnected {
			continue
		}
		result = append(result, SlotForTick{
			WriteCh:        s.writeCh,
			NeedsFullState: s.needsFullState,
		})
		s.needsFullState = false
	}
	return result
}

// pruneStaleSlots removes slots that have been in an inactive state (pending
// or waiting) longer than the given timeout. Called from the tick loop.
func (inst *Instance) pruneStaleSlots(now time.Time, timeout time.Duration) {
	inst.slotsMu.Lock()
	defer inst.slotsMu.Unlock()
	for id, s := range inst.slots {
		if (s.State == SlotStatePending || s.State == SlotStateWaiting) && now.Sub(s.stateEnteredAt) >= timeout {
			delete(inst.slots, id)
		}
	}
	inst.recomputeSlotCounts()
}

// recomputeSlotCounts recounts all slots and updates the atomics.
// Must be called with slotsMu held for writing.
func (inst *Instance) recomputeSlotCounts() {
	var total, active int64
	for _, s := range inst.slots {
		total++
		if s.State == SlotStateConnected {
			active++
		}
	}
	inst.atomicSlotCount.Store(total)
	inst.atomicActiveSlotCount.Store(active)
}
