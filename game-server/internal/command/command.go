package command

import (
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
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

// StartAttackingPayload requests that the unit begin auto-attacking its
// current target. A no-op if the unit has no target.
type StartAttackingPayload struct{}

func (StartAttackingPayload) CommandType() string { return "start_attacking" }

// StopAttackingPayload requests that the unit stop auto-attacking.
type StopAttackingPayload struct{}

func (StopAttackingPayload) CommandType() string { return "stop_attacking" }

// UsePowerPayload carries a fully-resolved power for the server to execute.
// The slot lookup and class config resolution happen in the WebSocket handler
// before the command is dispatched, so this carries the resolved Power directly.
type UsePowerPayload struct {
	Power instanceconfig.Power
}

func (UsePowerPayload) CommandType() string { return "use_power" }

// BasicAttackPayload requests one swing of the unit's weapon-less basic
// attack against its current target. The client sends this each time its
// local swing timer says the unit is ready; the server independently
// enforces the swing timer via UnitState.NextBasicAttackAt.
type BasicAttackPayload struct{}

func (BasicAttackPayload) CommandType() string { return "basic_attack" }

// RespawnPayload requests that the dead player unit be respawned at their spawn point.
type RespawnPayload struct{}

func (RespawnPayload) CommandType() string { return "respawn" }

// LootItemPayload requests that one item be taken from a lootable unit.
// TargetUnitID is the unit being looted; ItemIndex is the position in its LootItems slice.
type LootItemPayload struct {
	TargetUnitID uuid.UUID
	ItemIndex    int
}

func (LootItemPayload) CommandType() string { return "loot_item" }

// Command is a single client-initiated action, tagged with the unit it
// targets and the time it was received by the server.
type Command struct {
	UnitID     uuid.UUID
	ReceivedAt time.Time
	Payload    CommandPayload
}
