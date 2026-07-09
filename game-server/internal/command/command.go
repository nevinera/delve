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
// X and Y are optional: when present they carry the client-computed position
// and are used as the authoritative position (server applies collision on top).
// When absent the server derives movement from Keys each tick.
type MovePayload struct {
	Facing float64
	Keys   []MoveKey
	X      *float64
	Y      *float64
}

func (MovePayload) CommandType() string { return "move" }

// TargetPayload sets (or clears) the player's current target.
// A nil TargetID clears the target.
type TargetPayload struct {
	TargetID *uuid.UUID
}

func (TargetPayload) CommandType() string { return "target" }

// Command is a single client-initiated action, tagged with the unit it
// targets and the time it was received by the server.
type Command struct {
	UnitID     uuid.UUID
	ReceivedAt time.Time
	Payload    CommandPayload
}
