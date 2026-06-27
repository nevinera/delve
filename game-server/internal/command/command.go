package command

import (
	"time"

	"github.com/google/uuid"
)

// CommandPayload is the type-specific content of a Command.
type CommandPayload interface {
	CommandType() string
}

// MoveKey is one active movement input from the client.
type MoveKey string

const (
	MoveKeyForward     MoveKey = "forward"
	MoveKeyBackward    MoveKey = "backward"
	MoveKeyStrafeLeft  MoveKey = "strafe_left"
	MoveKeyStrafeRight MoveKey = "strafe_right"
)

// MovePayload carries the client's current facing and active movement keys.
type MovePayload struct {
	Facing float64
	Keys   []MoveKey
}

func (MovePayload) CommandType() string { return "move" }

// Command is a single client-initiated action, tagged with the unit it
// targets and the time it was received by the server.
type Command struct {
	UnitID     uuid.UUID
	ReceivedAt time.Time
	Payload    CommandPayload
}
