package instance

// Exports of internal symbols for use in package-level black-box tests.

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
	"github.com/delve-mmo/game-server/internal/pathing"
)

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
	applyUnitBehaviors(state, zone, dt, nil)
}

func ApplyUnitBehaviorsWithPathGraphForTest(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64, graph *pathing.Graph) {
	applyUnitBehaviors(state, zone, dt, graph)
}

func ApplyMapTransitionsForTest(state *instancestate.InstanceState, prevState *instancestate.InstanceState, zone instanceconfig.Zone) {
	applyMapTransitions(state, prevState, zone)
}

func ApplyNPCSeparationForTest(state *instancestate.InstanceState, dt float64) {
	applyNPCSeparation(state, dt)
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
	inst.drainPlayerSpawns(ctx, state)
}

func ExpireStatusEffectsForTest(state *instancestate.InstanceState, now time.Time) {
	expireStatusEffects(state, now)
}

func TickStatusEffectsForTest(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64) {
	tickStatusEffects(state, zone, dt)
}
