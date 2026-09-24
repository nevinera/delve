package instance

// Exports of internal symbols for use in package-level black-box tests.

import (
	"context"
	"encoding/json"
	"math/rand"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
	"github.com/delve-mmo/game-server/internal/pathing"
)

// sharedTestRng backs every ...ForTest wrapper below that exercises a rng-
// consuming function through its own fixed call shape (unlike a full
// *Instance, which gets a seeded Rand via makeInstance in instance_test.go) -
// one continuously-advancing seeded source, package-level so these wrappers
// keep their existing signatures (no rng param to thread through the many
// call sites across npc_movement_test.go/unit_behavior_test.go/
// status_effects_test.go). Must be a single shared stream, not a fresh
// rand.New(rand.NewSource(1)) per call: several tests retry one of these
// wrappers in a loop expecting a *different* roll each attempt (e.g. "retry
// until a miss/resist lands") - reseeding fresh every call would replay
// that seed's identical first roll forever, turning "landed 200 times in a
// row" into a permanent failure instead of the flake it used to be. A
// shared stream is still fully reproducible for a normal (sequential,
// non-parallel) `go test` run, same as the rest of this conversion.
func testRng() *rand.Rand { return sharedTestRng }

var sharedTestRng = rand.New(rand.NewSource(1))

func (inst *Instance) RegisterCommandHandlerForTest(h command.CommandHandler) {
	inst.commandProcessor.Register(h)
}

func ApplyMovementForTest(state *instancestate.InstanceState) {
	applyMovement(state)
}

func BuildFullStateMsgForTest(state *instancestate.InstanceState, now time.Time, checksum string) ([]byte, error) {
	return buildFullStateMsg(state, now, checksum, nil, nil)
}

func BuildDeltaMsgForTest(prev, curr *instancestate.InstanceState, now time.Time, checksum string) ([]byte, error) {
	return buildDeltaMsg(prev, curr, nil, nil, nil, now, checksum, nil, nil, nil, nil)
}

func BuildFullStateMsgWithSeqsForTest(state *instancestate.InstanceState, now time.Time, checksum string, heartbeatSeqs, moveSeqs map[uuid.UUID]string) ([]byte, error) {
	return buildFullStateMsg(state, now, checksum, heartbeatSeqs, moveSeqs)
}

func BuildDeltaMsgWithSeqsForTest(prev, curr *instancestate.InstanceState, now time.Time, checksum string, prevHeartbeatSeqs, currHeartbeatSeqs, prevMoveSeqs, currMoveSeqs map[uuid.UUID]string) ([]byte, error) {
	return buildDeltaMsg(prev, curr, nil, nil, nil, now, checksum, prevHeartbeatSeqs, currHeartbeatSeqs, prevMoveSeqs, currMoveSeqs)
}

func PushOutOfSegmentForTest(px, py, r, ax, ay, bx, by float64) (float64, float64) {
	return pushOutOfSegment(px, py, r, ax, ay, bx, by)
}

func PushOutOfCircleForTest(px, py, unitRadius, cx, cy, barrierRadius float64) (float64, float64) {
	return pushOutOfCircle(px, py, unitRadius, cx, cy, barrierRadius)
}

func ResolveCollisionsForTest(state *instancestate.InstanceState, zone instanceconfig.Zone) {
	resolveCollisions(state, zone)
}

func ApplyUnitBehaviorsForTest(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64) {
	applyUnitBehaviors(state, zone, dt, nil, testRng())
}

func ApplyUnitBehaviorsWithPathGraphForTest(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64, graph *pathing.Graph) {
	applyUnitBehaviors(state, zone, dt, graph, testRng())
}

func ApplyMapTransitionsForTest(state *instancestate.InstanceState, prevState *instancestate.InstanceState, zone instanceconfig.Zone) {
	applyMapTransitions(state, prevState, zone)
}

func ApplyNPCSeparationForTest(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64) {
	applyNPCSeparation(state, zone, dt)
}

func RestoreUnitsThatCrossedBarriersForTest(state, prevState *instancestate.InstanceState, zone instanceconfig.Zone) {
	restoreUnitsThatCrossedBarriers(state, prevState, zone)
}

func FacingTowardDegForTest(x1, y1, x2, y2 float64) float64 {
	return facingTowardDeg(x1, y1, x2, y2)
}

func LerpAngleDegForTest(a, b, t float64) float64 {
	return lerpAngleDeg(a, b, t)
}

func SweepLootClaimsForTest(state *instancestate.InstanceState) {
	sweepLootClaims(state)
}

func LootItemsEqualForTest(a, b []instancestate.PendingLootItem) bool {
	return lootItemsEqual(a, b)
}

func LootItemsToJSONForTest(items []instancestate.PendingLootItem) []byte {
	out, _ := json.Marshal(lootItemsToJSON(items))
	return out
}

func (inst *Instance) ProcessLootEventsForTest(ctx context.Context, state *instancestate.InstanceState) {
	inst.processLootEvents(ctx, state)
}

func (inst *Instance) DrainPlayerSpawnsForTest(ctx context.Context, state *instancestate.InstanceState) {
	inst.drainPlayerSpawns(ctx, state, time.Now())
}

func ExpireStatusEffectsForTest(state *instancestate.InstanceState, now time.Time) {
	expireStatusEffects(state, now)
}

func TickStatusEffectsForTest(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64) {
	tickStatusEffects(state, zone, dt, testRng())
}

func ProcessTriggeredStatusEffectsForTest(state *instancestate.InstanceState, zone instanceconfig.Zone, now time.Time, dt float64) {
	processTriggeredStatusEffects(state, zone, now, dt, testRng())
}

func RefreshStatusEffectConditionsForTest(state *instancestate.InstanceState) {
	refreshStatusEffectConditions(state)
}

func TickResourceRegenForTest(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64) {
	tickResourceRegen(state, zone, dt)
}

func TickHealthRegenForTest(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64) {
	tickHealthRegen(state, zone, dt)
}

func TickCastsForTest(state *instancestate.InstanceState, zone instanceconfig.Zone, now time.Time) []CombatEvent {
	var events []CombatEvent
	tickCasts(state, zone, now, &events, testRng())
	return events
}

const MaxPathSearchesPerTickForTest = maxPathSearchesPerTick
