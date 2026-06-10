package instance

import (
	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

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
