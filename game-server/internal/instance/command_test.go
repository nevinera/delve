package instance_test

import (
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// countingHandler counts how many times it is called.
type countingHandler struct {
	count atomic.Int64
}

func (h *countingHandler) Type() string      { return "move" }
func (h *countingHandler) Deduplicate() bool { return true }
func (h *countingHandler) Handle(_ uuid.UUID, _ command.CommandPayload, _ *instancestate.InstanceState) error {
	h.count.Add(1)
	return nil
}

func makeMove(unitID uuid.UUID) command.Command {
	return command.Command{
		UnitID:     unitID,
		ReceivedAt: time.Now(),
		Payload:    command.MovePayload{Facing: 0, Keys: []command.MoveKey{command.MoveKeyForward}},
	}
}

func TestSendCommand_NonBlockingWhenFull(t *testing.T) {
	inst := makeInstance()

	// Fill the channel beyond its capacity via SendCommand.
	for range instance.DefaultMaxSlots*8 + 10 {
		assert.NotPanics(t, func() {
			inst.SendCommand(makeMove(uuid.New()))
		})
	}
}

func TestSendCommand_ProcessedOnNextTick(t *testing.T) {
	reg := instance.NewRegistry()
	inst := startedInstance(t, reg)
	t.Cleanup(inst.Stop)

	h := &countingHandler{}
	inst.RegisterCommandHandlerForTest(h)

	inst.SendCommand(makeMove(uuid.New()))

	require.Eventually(t, func() bool {
		return h.count.Load() > 0
	}, 500*time.Millisecond, 10*time.Millisecond, "command should be processed within a few ticks")
}

func TestSendCommand_MultipleCommandsAllProcessed(t *testing.T) {
	reg := instance.NewRegistry()
	inst := startedInstance(t, reg)
	t.Cleanup(inst.Stop)

	// countingHandler deduplicates, so use distinct unit IDs to get separate calls.
	h := &countingHandler{}
	inst.RegisterCommandHandlerForTest(h)

	for range 5 {
		inst.SendCommand(makeMove(uuid.New()))
	}

	require.Eventually(t, func() bool {
		return h.count.Load() >= 5
	}, 500*time.Millisecond, 10*time.Millisecond, "all 5 commands should be processed")
}
