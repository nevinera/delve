package instance

import (
	"context"
	"log/slog"
	"time"

	"github.com/delve-mmo/game-server/internal/instancestate"
)

const TickInterval = 100 * time.Millisecond

// Start builds the initial InstanceState from the zone config, transitions the
// instance to StatusActive, and launches the tick goroutine. Returns an error
// if the zone config cannot produce a valid initial state (e.g. units with
// missing identifiers).
func (inst *Instance) Start() error {
	state, err := instancestate.NewInstanceState(inst.ZoneConfig)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithCancel(context.Background())
	inst.cancel = cancel
	inst.done = make(chan struct{})
	inst.Status = StatusActive
	go inst.run(ctx, state)
	return nil
}

// Stop signals the tick goroutine to exit and blocks until it does.
func (inst *Instance) Stop() {
	inst.Status = StatusStopping
	inst.cancel()
	<-inst.done
}

func (inst *Instance) run(ctx context.Context, state *instancestate.InstanceState) {
	defer close(inst.done)

	ticker := time.NewTicker(TickInterval)
	defer ticker.Stop()

	var tickCount int64
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			tickCount++
			slog.DebugContext(ctx, "tick",
				"instance", inst.Identifier,
				"tick", tickCount,
				"units", len(state.Units),
			)
		}
	}
}
