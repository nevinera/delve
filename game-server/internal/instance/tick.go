package instance

import (
	"context"
	"log/slog"
	"time"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

const TickInterval = 100 * time.Millisecond

// EmptyInstanceTimeout is how long an instance must have zero slots before it
// shuts itself down. Override per-instance via Instance.EmptyTimeout for tests.
const EmptyInstanceTimeout = 60 * time.Second

// SlotWaitingTimeout is how long a slot can remain in SlotStateWaiting before
// it is removed. Override per-instance via Instance.SlotWaitTimeout for tests.
const SlotWaitingTimeout = 5 * time.Minute

// Start builds the initial InstanceState from the zone config, transitions the
// instance to StatusActive, and launches the tick goroutine. Returns an error
// if the zone config cannot produce a valid initial state (e.g. units with
// missing identifiers).
//
// If registry is non-nil, a cleanup goroutine is launched that removes the
// instance from the registry when the tick loop exits (whether via Stop or
// the empty-instance timeout).
func (inst *Instance) Start(registry *Registry) error {
	state, err := instancestate.NewInstanceState(inst.ZoneConfig)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithCancel(context.Background())
	inst.cancel = cancel
	inst.done = make(chan struct{})
	inst.Status = StatusActive
	go inst.run(ctx, state)
	if registry != nil {
		go func() {
			<-inst.done
			registry.Remove(inst.Identifier)
		}()
	}
	return nil
}

// Stop signals the tick goroutine to exit and blocks until it does.
func (inst *Instance) Stop() {
	inst.Status = StatusStopping
	inst.cancel()
	<-inst.done
}

// Done returns a channel that is closed when the instance's tick loop exits.
func (inst *Instance) Done() <-chan struct{} {
	return inst.done
}

func (inst *Instance) drainCommands() []command.Command {
	var cmds []command.Command
	for {
		select {
		case cmd := <-inst.commandCh:
			cmds = append(cmds, cmd)
		default:
			return cmds
		}
	}
}

func (inst *Instance) run(ctx context.Context, state *instancestate.InstanceState) {
	defer close(inst.done)

	ticker := time.NewTicker(TickInterval)
	defer ticker.Stop()

	prevState := state.Clone()
	var tickCount int64
	var emptyAt time.Time // zero means "not yet tracking"

	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			tickCount++
			inst.drainPlayerSpawns(ctx, state)
			inst.commandProcessor.Process(inst.drainCommands(), state)
			checksum := state.Checksum()
			inst.Checksum = checksum

			if slots := inst.SlotsForTick(); len(slots) > 0 {
				// Build the delta once; reuse for all slots that don't need full state.
				var deltaPayload []byte
				for _, s := range slots {
					var payload []byte
					var err error
					if s.NeedsFullState {
						payload, err = buildFullStateMsg(state, now, checksum)
					} else {
						if deltaPayload == nil {
							deltaPayload, err = buildDeltaMsg(prevState, state, now, checksum)
						}
						payload = deltaPayload
					}
					if err != nil {
						slog.ErrorContext(ctx, "failed to build tick message", "error", err)
						continue
					}
					// Non-blocking: drop the message if the client is behind.
					select {
					case s.WriteCh <- payload:
					default:
					}
				}
			}

			prevState = state.Clone()

			// Remove slots that have been pending or waiting too long.
			slotWaitTimeout := inst.SlotWaitTimeout
			if slotWaitTimeout == 0 {
				slotWaitTimeout = SlotWaitingTimeout
			}
			inst.pruneStaleSlots(now, slotWaitTimeout)

			// Auto-stop when the instance has had no slots for the empty timeout.
			total, _ := inst.SlotCounts()
			if total == 0 {
				if emptyAt.IsZero() {
					emptyAt = now
				} else {
					timeout := inst.EmptyTimeout
					if timeout == 0 {
						timeout = EmptyInstanceTimeout
					}
					if now.Sub(emptyAt) >= timeout {
						inst.Status = StatusStopping
						inst.cancel()
						return
					}
				}
			} else {
				emptyAt = time.Time{}
			}

			slog.DebugContext(ctx, "tick",
				"instance", inst.Identifier,
				"tick", tickCount,
				"units", len(state.Units),
				"checksum", checksum,
			)
		}
	}
}
