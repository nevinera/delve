package command

import (
	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instancestate"
)

// CommandHandler processes one type of Command against the next InstanceState.
type CommandHandler interface {
	Type() string
	Deduplicate() bool
	Handle(unitID uuid.UUID, payload CommandPayload, next *instancestate.InstanceState) error
}

// CommandProcessor dispatches a batch of Commands to registered handlers,
// de-duplicating where requested before delegating.
type CommandProcessor struct {
	handlers map[string]CommandHandler
}

func NewCommandProcessor() *CommandProcessor {
	return &CommandProcessor{handlers: make(map[string]CommandHandler)}
}

// Register adds a handler. Panics if a handler for the same type is already registered.
func (p *CommandProcessor) Register(h CommandHandler) {
	if _, exists := p.handlers[h.Type()]; exists {
		panic("command: handler already registered for type " + h.Type())
	}
	p.handlers[h.Type()] = h
}

// Process applies commands to next, de-duplicating per (unit, type) for handlers
// that request it. Commands are assumed to be in received order; de-dup keeps
// the last command per unit per type.
func (p *CommandProcessor) Process(commands []Command, next *instancestate.InstanceState) {
	type dedupKey struct {
		unitID uuid.UUID
		typ    string
	}

	// For dedup handlers, record the index of the last command per (unit, type).
	lastIdx := make(map[dedupKey]int)
	for i, cmd := range commands {
		h, ok := p.handlers[cmd.Payload.CommandType()]
		if !ok || !h.Deduplicate() {
			continue
		}
		lastIdx[dedupKey{cmd.UnitID, cmd.Payload.CommandType()}] = i
	}

	for i, cmd := range commands {
		h, ok := p.handlers[cmd.Payload.CommandType()]
		if !ok {
			continue
		}
		if h.Deduplicate() {
			if lastIdx[dedupKey{cmd.UnitID, cmd.Payload.CommandType()}] != i {
				continue
			}
		}
		// Errors are silently discarded; handlers are expected to be robust
		// (e.g. no-op when the target unit does not exist).
		_ = h.Handle(cmd.UnitID, cmd.Payload, next)
	}
}
