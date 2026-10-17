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
	"github.com/delve-mmo/game-server/internal/mapfill"
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
	return buildFullStateMsg(state, now, checksum, nil, nil, time.Time{})
}

func BuildDeltaMsgForTest(prev, curr *instancestate.InstanceState, now time.Time, checksum string) ([]byte, error) {
	return buildDeltaMsg(prev, curr, nil, nil, nil, now, checksum, nil, nil, nil, nil)
}

func BuildFullStateMsgWithSeqsForTest(state *instancestate.InstanceState, now time.Time, checksum string, heartbeatSeqs, moveSeqs map[uuid.UUID]string) ([]byte, error) {
	return buildFullStateMsg(state, now, checksum, heartbeatSeqs, moveSeqs, time.Time{})
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
	updateCombatStats(state, zone)
	resolveCollisions(state, zone, zoneFills(zone))
}

func ApplyUnitBehaviorsForTest(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64) {
	updateCombatStats(state, zone)
	applyUnitBehaviors(state, zone, dt, nil, testRng())
}

func ApplyUnitBehaviorsWithPathGraphForTest(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64, graph *pathing.Graph) {
	updateCombatStats(state, zone)
	applyUnitBehaviors(state, zone, dt, graph, testRng())
}

func ApplyMapTransitionsForTest(state *instancestate.InstanceState, prevState *instancestate.InstanceState, zone instanceconfig.Zone) {
	updateCombatStats(state, zone)
	applyMapTransitions(state, prevState, zone, zoneFills(zone))
}

func ApplyNPCSeparationForTest(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64) {
	updateCombatStats(state, zone)
	applyNPCSeparation(state, zone, dt)
}

func RestoreUnitsThatCrossedBarriersForTest(state, prevState *instancestate.InstanceState, zone instanceconfig.Zone) {
	updateCombatStats(state, zone)
	restoreUnitsThatCrossedBarriers(state, prevState, zone, zoneFills(zone))
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
	updateCombatStats(state, zone)
	tickStatusEffects(state, zone, dt, testRng())
}

func ProcessTriggeredStatusEffectsForTest(state *instancestate.InstanceState, zone instanceconfig.Zone, now time.Time, dt float64) {
	updateCombatStats(state, zone)
	processTriggeredStatusEffects(state, zone, now, dt, testRng())
}

func RefreshStatusEffectConditionsForTest(state *instancestate.InstanceState) {
	refreshStatusEffectConditions(state)
}

func TickResourceRegenForTest(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64) {
	updateCombatStats(state, zone)
	tickResourceRegen(state, zone, dt)
}

func TickHealthRegenForTest(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64) {
	updateCombatStats(state, zone)
	tickHealthRegen(state, zone, dt)
}

func TickCastsForTest(state *instancestate.InstanceState, zone instanceconfig.Zone, now time.Time) []CombatEvent {
	updateCombatStats(state, zone)
	var events []CombatEvent
	tickCasts(state, zone, now, &events, testRng())
	return events
}

const MaxPathSearchesPerTickForTest = maxPathSearchesPerTick

func ScheduleRespawnsForTest(state *instancestate.InstanceState, now time.Time) {
	scheduleRespawns(state, now)
}

func TickRespawnsForTest(state *instancestate.InstanceState, now time.Time) {
	tickRespawns(state, now, testRng())
}

func TickNCUMovementForTest(state *instancestate.InstanceState, dt float64) {
	tickNCUMovement(state, dt, testRng())
}

func UpdateCombatStatsForTest(state *instancestate.InstanceState, zone instanceconfig.Zone) {
	updateCombatStats(state, zone)
}

func RemoveUnitForTest(state *instancestate.InstanceState, unitID uuid.UUID) {
	removeUnit(state, unitID)
}

func (inst *Instance) FireLootAwardForTest(ctx context.Context, pending instancestate.PendingLootClaim) {
	inst.fireLootAward(ctx, pending)
}

func SpawnPlacementForTest(zone instanceconfig.Zone, spawnAt string) (string, instanceconfig.Position) {
	return spawnPlacement(zone, spawnAt, zoneFills(zone))
}

func zoneFills(zone instanceconfig.Zone) map[string]*mapfill.Fill {
	fills, _ := mapfill.ForZone(zone)
	return fills
}

type PendingZoneExitForTest struct {
	SlotID           uuid.UUID
	UnitID           uuid.UUID
	WorldCharacterID string
	Connection       string
	NeedsConfirm     bool
}

func (inst *Instance) DetectZoneExitsForTest(state, prevState *instancestate.InstanceState, now time.Time) []PendingZoneExitForTest {
	var out []PendingZoneExitForTest
	for _, p := range inst.detectZoneExits(state, prevState, now) {
		out = append(out, PendingZoneExitForTest{p.slotID, p.unitID, p.worldCharacterID, p.connection, p.needsConfirm})
	}
	return out
}

func (inst *Instance) ArmZoneExitsForTest(unitID uuid.UUID, now time.Time) {
	inst.armZoneExits(unitID, now)
}

// FinishZoneExitForTest feeds a Rails exit result back to the instance and
// drains it, as the tick loop would.
func (inst *Instance) FinishZoneExitForTest(exit PendingZoneExitForTest, err error, now time.Time) {
	inst.zoneExitResultCh <- zoneExitResult{
		pendingZoneExit: pendingZoneExit{slotID: exit.SlotID, unitID: exit.UnitID, worldCharacterID: exit.WorldCharacterID, connection: exit.Connection},
		err:             err,
	}
	inst.drainZoneExitResults(now)
}

func (inst *Instance) TickExpiryForTest(now time.Time) bool {
	return inst.tickExpiry(now)
}

func BuildFullStateMsgWithExpiryForTest(state *instancestate.InstanceState, now time.Time, expiresAt time.Time) ([]byte, error) {
	return buildFullStateMsg(state, now, "", nil, nil, expiresAt)
}

func LeashDistanceForTest(unit *instancestate.UnitState) float64 { return leashDistance(unit) }

func RecordLeashCrossingForTest(unit *instancestate.UnitState, fromMapID string, prevX, prevY float64) {
	recordLeashCrossing(unit, fromMapID, prevX, prevY)
}

func UpdateCombatClocksForTest(state *instancestate.InstanceState, now time.Time) {
	updateCombatClocks(state, now)
}

func FireDeathEffectsForTest(state, prevState *instancestate.InstanceState, zone instanceconfig.Zone) []CombatEvent {
	var events []CombatEvent
	updateCombatStats(state, zone)
	fireDeathEffects(state, prevState, zone, time.Now(), &events, testRng())
	return events
}

func ResolveImpactsForTest(state *instancestate.InstanceState, zone instanceconfig.Zone, now time.Time) {
	updateCombatStats(state, zone)
	resolveImpacts(state, zone, now, testRng())
}

func UpdateStealthForTest(state, prev *instancestate.InstanceState, zone instanceconfig.Zone) {
	updateStealth(state, prev, zone)
}

// StealthViewForTest builds observer's stealth view and splices it onto payload.
func StealthViewForTest(payload []byte, state *instancestate.InstanceState, observer uuid.UUID, zone instanceconfig.Zone) ([]byte, error) {
	return withStealthView(payload, stealthView(state.Units[observer], stealthedUnits(state), zone))
}

// QuestEventForTest is a quest event (see quest_progress.go).
type QuestEventForTest = questEvent

// CollectQuestEventsForTest runs collectQuestEvents, with visits as this
// tick's collectVisits found.
func (inst *Instance) CollectQuestEventsForTest(prev, curr *instancestate.InstanceState, visits ...VisitEventForTest) []QuestEventForTest {
	events := make([]visitEvent, len(visits))
	for i, v := range visits {
		events[i] = visitEvent(v)
	}
	return inst.collectQuestEvents(prev, curr, events)
}

// ProcessTalksForTest runs processTalks on talks, after collectVisits on
// state (for where each player is).
func (inst *Instance) ProcessTalksForTest(ctx context.Context, state *instancestate.InstanceState, talks []instancestate.Talk) {
	inst.collectVisits(state)
	inst.processTalks(ctx, talks)
}

func (inst *Instance) TickQuestTimersForTest(ctx context.Context, now time.Time) {
	inst.tickQuestTimers(ctx, now)
}

// CastingNameForTest is the cast bar's label for a cast (castingJSON's).
func CastingNameForTest(c *instancestate.CastState) string {
	name, _, _ := castingJSON(c)
	return *name
}

// VisitEventForTest is a visitEvent with exported fields.
type VisitEventForTest struct {
	UnitID uuid.UUID
	Visit  Visit
}

// CollectVisitsForTest runs collectVisits on state, then (when record is
// set) RecordVisits on what it found, synchronously.
func (inst *Instance) CollectVisitsForTest(ctx context.Context, state *instancestate.InstanceState, record bool) []VisitEventForTest {
	events := inst.collectVisits(state)
	if record {
		inst.RecordVisits(ctx, events)
	}
	out := make([]VisitEventForTest, len(events))
	for i, e := range events {
		out[i] = VisitEventForTest(e)
	}
	return out
}

// UpdatePlayerSpeedForTest exposes updatePlayerSpeed.
func UpdatePlayerSpeedForTest(state *instancestate.InstanceState) { updatePlayerSpeed(state) }

// AskZoneExitConfirmForTest sends the confirm prompt for an exit, as the tick
// loop does for one flagged NeedsConfirm.
func (inst *Instance) AskZoneExitConfirmForTest(exit PendingZoneExitForTest, now time.Time) {
	inst.askZoneExitConfirm(pendingZoneExit{slotID: exit.SlotID, unitID: exit.UnitID, worldCharacterID: exit.WorldCharacterID, connection: exit.Connection}, now)
}

// ConfirmZoneExitsForTest feeds a player's "yes, leave" answer through the
// tick's command intercept and returns the exits it releases.
func (inst *Instance) ConfirmZoneExitsForTest(unitID uuid.UUID) []PendingZoneExitForTest {
	_, released := inst.takeZoneExitConfirms([]command.Command{{UnitID: unitID, Payload: command.ConfirmZoneExitPayload{}}})
	var out []PendingZoneExitForTest
	for _, p := range released {
		out = append(out, PendingZoneExitForTest{p.slotID, p.unitID, p.worldCharacterID, p.connection, p.needsConfirm})
	}
	return out
}
