package instance

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"

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
	// Registered here, not NewInstance, so a test that overrides inst.Rand
	// after construction (same pattern as EmptyTimeout/SlotWaitTimeout) is
	// picked up - these two handlers capture inst.Rand by value once, not
	// read it fresh on every Handle call.
	inst.commandProcessor.Register(command.BasicAttackHandler{Rng: inst.Rand})
	inst.commandProcessor.Register(command.UsePowerHandler{Rng: inst.Rand})
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
	prevHeartbeatSeqs := map[uuid.UUID]string{}
	prevMoveSeqs := map[uuid.UUID]string{}
	var tickCount int64
	var emptyAt time.Time // zero means "not yet tracking"

	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			tickCount++
			inst.drainPlayerSpawns(ctx, state, now)
			refreshStatusEffectConditions(state)
			inst.commandProcessor.Process(inst.drainCommands(), inst.ZoneConfig, state)
			var combatEvents []CombatEvent
			tickCasts(state, inst.ZoneConfig, now, &combatEvents, inst.Rand)
			updatePlayerMaxHealth(state, inst.ZoneConfig)
			applyMovement(state)
			applyMapTransitions(state, prevState, inst.ZoneConfig)
			combatEvents = append(combatEvents, applyUnitBehaviors(state, inst.ZoneConfig, TickInterval.Seconds(), inst.PathGraph, inst.Rand)...)
			tickNCUMovement(state, TickInterval.Seconds(), inst.Rand)
			combatEvents = append(combatEvents, state.PendingCombatEvents...)
			tickStatusEffects(state, inst.ZoneConfig, TickInterval.Seconds(), inst.Rand)
			processTriggeredStatusEffects(state, inst.ZoneConfig, now, TickInterval.Seconds(), inst.Rand)
			scheduleRespawns(state, now)
			tickRespawns(state, now, inst.Rand)
			tickResourceRegen(state, inst.ZoneConfig, TickInterval.Seconds())
			tickHealthRegen(state, inst.ZoneConfig, TickInterval.Seconds())
			expireStatusEffects(state, now)
			resolveCollisions(state, inst.ZoneConfig)
			restoreUnitsThatCrossedBarriers(state, prevState, inst.ZoneConfig)
			roundPositions(state)
			sweepLootClaims(state)
			inst.processLootEvents(ctx, state)

		drainAutoUpgrades:
			for {
				select {
				case result := <-inst.autoUpgradeResultCh:
					if result.Success {
						if slot := inst.slotByUnitID(result.CharacterUnitID); slot != nil {
							if slot.OwnedZoneItems == nil {
								slot.OwnedZoneItems = make(map[string]bool)
							}
							slot.OwnedZoneItems[result.ItemIdentifier] = true
						}
					}
					newState := instancestate.LootClaimStateAvailable
					if result.Success {
						newState = instancestate.LootClaimStateUpgraded
					}
					if unit, ok := state.Units[result.LootUnitUUID]; ok {
						for i := range unit.LootItems {
							if unit.LootItems[i].Item.Identifier == result.ItemIdentifier {
								for j := range unit.LootItems[i].Claims {
									if unit.LootItems[i].Claims[j].CharacterUnitID == result.CharacterUnitID {
										unit.LootItems[i].Claims[j].State = newState
										break
									}
								}
								break
							}
						}
					}
				default:
					break drainAutoUpgrades
				}
			}

			checksum := state.Checksum()
			inst.Checksum = checksum
			heartbeatSeqs := inst.LastSeqsByUnit("heartbeat")
			moveSeqs := inst.LastSeqsByUnit("move")

			if slots := inst.SlotsForTick(); len(slots) > 0 {
				// Build the delta once; reuse for all slots that don't need full state.
				var deltaPayload []byte
				for _, s := range slots {
					var payload []byte
					var err error
					if s.NeedsFullState {
						payload, err = buildFullStateMsg(state, now, checksum, heartbeatSeqs, moveSeqs)
					} else {
						if deltaPayload == nil {
							deltaPayload, err = buildDeltaMsg(prevState, state, combatEvents, state.PendingLootEvents, state.PendingLootFailures, now, checksum, prevHeartbeatSeqs, heartbeatSeqs, prevMoveSeqs, moveSeqs)
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

			for _, pending := range state.PendingLootClaims {
				go inst.fireLootAward(ctx, pending)
			}

			for _, update := range state.PendingOwnershipUpdates {
				if slot := inst.slotByUnitID(update.CharacterUnitID); slot != nil {
					if slot.OwnedZoneItems == nil {
						slot.OwnedZoneItems = make(map[string]bool)
					}
					slot.OwnedZoneItems[update.ItemIdentifier] = true
				}
			}

			state.PendingLootEvents = nil
			state.PendingLootClaims = nil
			state.PendingLootFailures = nil
			state.PendingOwnershipUpdates = nil
			state.PendingCombatEvents = nil
			prevState = state.Clone()
			prevHeartbeatSeqs = heartbeatSeqs
			prevMoveSeqs = moveSeqs

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
