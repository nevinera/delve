package instancestate

import (
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/pathing"
)

// LootClaimState is the per-character state of a loot item claim.
type LootClaimState string

const (
	LootClaimStateAvailable   LootClaimState = "available"     // character can take this item
	LootClaimStateUpgrade     LootClaimState = "upgrade"       // auto-upgrade goroutine in flight
	LootClaimStateUpgraded    LootClaimState = "upgraded"      // auto-upgrade (or other-version manual take) confirmed
	LootClaimStateLocked      LootClaimState = "locked"        // someone else has it claimed
	LootClaimStateLockedForMe LootClaimState = "locked_for_me" // this character's manual take is in flight
	LootClaimStateReceived    LootClaimState = "received"      // this character got it (new award)
	LootClaimStateGone        LootClaimState = "gone"          // consumed by another character
	LootClaimStateOwned       LootClaimState = "owned"         // character already owns this exact version
)

// CharacterLootClaim is one character's relationship to a loot item.
type CharacterLootClaim struct {
	CharacterUnitID uuid.UUID
	State           LootClaimState
}

// LootResult is the outcome of a loot award goroutine.
type LootResult struct {
	Remove         bool // true = item was newly awarded; remove it from loot
	ConfirmedOwned bool // true = Rails confirmed the character owns this version
	ExactVersion   bool // true = 409; character already has this exact source_key
}

// LootClaim is an in-flight attempt to take one loot item. The goroutine
// writes the result once; the tick loop reads it next tick.
type LootClaim struct {
	ClaimedBy uuid.UUID
	Result    chan LootResult // buffered(1)
}

// PendingLootItem is one item in a unit's loot list, optionally in-flight.
type PendingLootItem struct {
	ClaimID uuid.UUID
	Item    instanceconfig.Item
	Claim   *LootClaim           // nil = no manual take in flight
	Claims  []CharacterLootClaim // one per character present at loot roll
}

// ResourceState is the runtime state of one of a unit's resources (see
// UnitState.Resources) - a class or unit_type can define several
// (docs/schema/character_class.md/unit_type.md), each tracked independently.
type ResourceState struct {
	Current float64
	Max     float64 // cached from ResourceType.Max at spawn
	// DefaultValue/ReturnRate are cached from the ResourceType at spawn - the
	// passive regen tick moves Current toward DefaultValue at ReturnRate/sec.
	// ReturnRate 0 (the schema default) is a no-op regen - e.g. a discrete
	// resource like combo points that only ever changes via a power's
	// "resource" effect.
	DefaultValue float64
	ReturnRate   float64
	// HasteAffected mirrors ResourceType.HasteAffected - when true, the regen
	// tick scales ReturnRate by the unit's Haste% (see command.UnitCombatStats)
	// before applying it.
	HasteAffected bool
	// RecoveryAffected mirrors ResourceType.RecoveryAffected - when true, the
	// regen tick scales ReturnRate by the unit's Recovery Rating-derived
	// healing-taken% (see command.HealingTakenPct) before applying it,
	// independent of (and stacking with) HasteAffected.
	RecoveryAffected bool
}

// UnitStatus is the lifecycle/combat state of a unit.
type UnitStatus string

const (
	UnitStatusIdle     UnitStatus = "idle"
	UnitStatusEngaged  UnitStatus = "engaged"
	UnitStatusLeashing UnitStatus = "leashing"
	UnitStatusDead     UnitStatus = "dead"
	// UnitStatusRespawning is the brief (randomized) window between a dead
	// unit's RespawnConfig delay elapsing and it actually becoming usable
	// again (docs/schema/common.md#respawnconfig, issue #69) - present at
	// its spawn point, but not targetable and not yet acting. See
	// instance/respawn.go.
	UnitStatusRespawning UnitStatus = "respawning"
)

// IsTargetable reports whether a unit in this status can be the recipient
// of an attack/cast/power - false for dead (no target to hit) and
// respawning (present, but not real yet - issue #69).
func (s UnitStatus) IsTargetable() bool {
	return s != UnitStatusDead && s != UnitStatusRespawning
}

// ActiveStatusEffect is one status currently applied to a unit, identified
// by (Status.Name, ApplierID) - different appliers' copies of the
// same-named status are tracked independently, so e.g. two casters' DoTs on
// the same target don't stomp each other. The Status definition is
// snapshotted at apply time (not just its name) so later processing doesn't
// need to re-resolve which power granted it. See docs/schema/status.md and
// command.ApplyStatus.
type ActiveStatusEffect struct {
	Status    instanceconfig.Status
	ApplierID uuid.UUID

	// ExpiresAt is the sole duration clock - "duration-remaining" is always
	// derived as ExpiresAt.Sub(now). Every stack of a "stack"-stacking
	// status shares this one timer (docs/schema/status.md): a new
	// application refreshes it to the full duration rather than each stack
	// having its own independent expiry.
	ExpiresAt time.Time

	// Stacks is meaningful only when Status.Stacking == "stack"; 1 for
	// "extend"/"replace".
	Stacks int

	// TimeUntilNextTick is parallel to Status.Effects: for each "recurring"
	// entry, seconds remaining until its next tick. Counts down by dt every
	// server tick; when it fires, the interval for the *following* tick is
	// recomputed from the applier's Haste as of that moment (see
	// command.RecurringTickInterval) - not continuously re-evaluated
	// between ticks, and not snapshotted once at apply time either, so a
	// Haste change takes effect starting with whichever tick fires next
	// (see docs/stats.md's Haste and tmp/plan.md). Unused (0) for
	// non-recurring entries.
	TimeUntilNextTick []float64

	// ConditionsMet is parallel to Status.Effects: whether each entry's
	// StatusEffect.Condition currently holds (see command.ConditionMet).
	// true for an entry with no Condition (always live). Seeded at
	// application time (see command.ApplyStatus) and refreshed roughly once
	// per server tick - not continuously re-evaluated on every read, since
	// some conditions (targetHealthPct, casterResource) need the full
	// instance state to resolve, which the many stat-math call sites that
	// actually consume this (command.ActiveStatModifiers and friends) don't
	// have. See instance/status_conditions.go (and classdps's mirror of it)
	// for where the refresh happens.
	ConditionsMet []bool

	// TriggerCooldownsRemaining is parallel to Status.Effects: for each
	// "triggered" entry, seconds remaining until it's next allowed to fire
	// (StatusEffect.InternalCooldown - see command.FireTriggeredEffect).
	// Seeded at 0 (ready immediately) on application - unlike
	// TimeUntilNextTick's Haste-scaled first interval, a trigger's first
	// possible fire isn't delayed by anything. Counts down by dt every
	// server tick; reset to InternalCooldown whenever it fires. Unused (0)
	// for non-triggered entries.
	TriggerCooldownsRemaining []float64
}

// MovementIntent holds the player-commanded movement keys for a unit.
// Zero value means not moving. Only meaningful for player character units;
// NPC movement is driven by BehaviorState instead.
type MovementIntent struct {
	Forward     bool
	Backward    bool
	StrafeLeft  bool
	StrafeRight bool
}

// BehaviorState tracks tick-loop progress for a unit's movement and tactics.
// Zero value is valid for units with "still" movement and non-phased/scripted tactics.
type BehaviorState struct {
	// NPC movement state machine.
	// MovementPhase == "" means still or not yet initialized.
	MovementPhase    string  // "", "moving", "waiting", "turning"
	PatrolStepIndex  int     // current waypoint index for patrol
	PatrolDir        int     // 1 or -1; direction of travel for "return" patrol mode
	PendingStepIndex int     // step index to apply when a turn completes (patrol only)
	TargetX          float64 // map-coord movement target
	TargetY          float64
	MoveRate         float64 // fraction of base speed for this leg
	WaitRemaining    float64 // seconds remaining in a wait
	TurnElapsed      float64 // seconds elapsed in a turning animation
	TurnStartAngle   float64 // degrees at turn start
	TurnEndAngle     float64 // degrees at turn end

	// last known position of the chase target, in this unit's map coordinates.
	// Updated each tick the target is visible (same map). Used to navigate
	// toward the connection the target crossed when they leave this map.
	LastSeenX float64
	LastSeenY float64

	// position and map recorded when the unit first engaged. Used to leash back
	// after the target dies or disappears.
	LeashX     float64
	LeashY     float64
	LeashMapID string

	// short-range detour around obstacles when the chase target isn't in
	// direct line of sight. Waypoints are consumed front-to-back as the unit
	// reaches each one; PathRecalcIn counts down so the underlying
	// visibility-graph query only reruns periodically, not every tick.
	PathWaypoints []pathing.Point
	PathRecalcIn  float64
	// where the chase target was when PathWaypoints was planned; an expired
	// PathRecalcIn only triggers a new search if the target has moved.
	PathGoalX float64
	PathGoalY float64

	// rotation tactics: index into UnitTactics.Powers of the power currently
	// "up next" - advances only once that specific power actually fires,
	// per docs/schema/unit_type.md's "waiting for each to become usable
	// before proceeding" (not skipped ahead if it isn't usable yet).
	RotationIndex int

	// phased tactics
	PhaseIndex   int
	PhaseElapsed float64 // seconds elapsed in the current phase

	// scripted tactics
	ScriptElapsed float64 // seconds elapsed in the current script window
}

// UnitState is the full runtime state of one unit instance.
type UnitState struct {
	ZoneUnitIdentifier string // non-empty: Unit.Identifier from zone config
	UnitTypeIdentifier string // key into zone.UnitTypes
	MapIdentifier      string
	Hostility          string // "hostile", "neutral", "friendly", or "" for players
	Position           instanceconfig.Position
	SpawnPoint         instanceconfig.Position // initial position; used for respawn
	SpawnMapIdentifier string                  // map the unit spawned into; used for respawn

	Health    float64
	MaxHealth float64 // cached from UnitType.MaxHP at spawn

	// Resources holds one entry per resource this unit has, keyed by
	// ResourceType.Name - an NPC has at most one (UnitType.Resource, singular);
	// a player has one per CharacterClass.Resources (docs/schema/
	// character_class.md - a class's own resources array, not just its primary).
	// A unit with no resources at all has a nil/empty map. Costs and "resource"
	// PowerEffects are always looked up here by name - there's no bare "the
	// resource" field anymore, since a class can have several.
	Resources map[string]*ResourceState
	// PrimaryResourceName is the key into Resources that's displayed and
	// regenerated as "the" resource in the HUD - CharacterClass.
	// PrimaryResource().Name for a player, or the single UnitType.Resource's
	// own name for an NPC. "" for a unit with no resources.
	PrimaryResourceName string

	Speed  float64 // movement speed in feet per second
	Radius float64 // collision radius in feet; 0 means no collision (NPCs for now)

	// Player-only combat inputs, cached from the InstanceSlot at spawn; nil/""
	// for NPCs. EquippedItems carries each item's own elvl so combat math can
	// scale it against the unit's *current* map (see instanceconfig.Zone.MapElvl)
	// rather than a value fixed at spawn - see docs/stats.md.
	EquippedItems map[string]instanceconfig.EquippedItem
	DamageStatKey string // "strength", "agility", or "" - see CharacterClass.DamageStatKey

	LootTable map[string]int // identifier → weight; nil means no loot
	LootCount [2]float64     // [min, max]; both 1 when lootCount omitted. A resolved value
	// >= 1 awards that many items (truncated); a value in [0, 1)
	// is the probability of awarding exactly one item.
	LootItems []PendingLootItem // rolled at death; nil until the unit dies

	// Respawn is the resolved RespawnConfig this unit spawned with (Zone.
	// UnitRespawn's Unit>Map>Zone cascade, computed once at spawn) - nil/
	// zero-value ({Type: ""}) for a player, who never uses this automatic
	// path (see command.RespawnHandler instead). See instance/respawn.go.
	Respawn instanceconfig.RespawnConfig
	// RespawnAt is when a dead unit with Respawn.Type == "timer" starts
	// visibly respawning - zero means "not scheduled" (not dead, Respawn is
	// "none", or already consumed). Set once by instance.scheduleRespawns
	// right after death; consumed (reset to zero) by instance.tickRespawns
	// when it fires.
	RespawnAt time.Time
	// RespawningUntil is when a unit in UnitStatusRespawning finishes and
	// becomes fully alive again - zero means "not currently respawning".
	// Set by instance.tickRespawns to now + a random 2-5s window when
	// RespawnAt fires; consumed (reset to zero) when it elapses.
	RespawningUntil time.Time

	Status               UnitStatus
	Target               *uuid.UUID
	Attacking            bool       // true while auto-attacking Target; always false when Target is nil
	NextBasicAttackAt    time.Time  // swing timer: basic attacks rejected before this time
	TaggedBy             *uuid.UUID // first player to damage this unit
	GlobalCooldownEndsAt time.Time
	PowerCooldowns       map[string]time.Time // keyed by power name; zero/missing means ready
	ActiveStatusEffects  []ActiveStatusEffect
	Behavior             BehaviorState
	MovementIntent       MovementIntent

	// DamageTakenThisTick/DamageDealtThisTick back a StatusTrigger
	// {type: "takesDamage"/"dealsDamage"} (see command.TriggerHolds) - set
	// wherever combat actually connects (a basic attack, a harm PowerEffect,
	// or a recurring StatusEffect tick; not a miss/avoid, which deals 0) and
	// cleared once per tick by instance.processTriggeredStatusEffects after
	// triggers have had a chance to see them - so they mean "this happened
	// sometime during the tick just processed", not an instantaneous flag.
	DamageTakenThisTick bool
	DamageDealtThisTick bool

	// LastMoveAt is when the server last processed a client-submitted move
	// with an explicit position (see command.MoveHandler), used to bound how
	// far that position can feasibly have moved since - zero until the first
	// such move.
	LastMoveAt time.Time

	// Casting is non-nil while the unit is mid-cast on a power with a
	// non-zero CastTime - nil means "not casting". See command.UsePowerHandler
	// and instance.tryNPCAttack (cast start), instance.tickCasts (resolution).
	Casting *CastState
}

// CastState tracks a unit's in-progress cast-time power - see UnitState.Casting.
type CastState struct {
	Power     instanceconfig.Power
	TargetID  *uuid.UUID // snapshot of unit.Target at cast start; nil for self-only powers
	StartedAt time.Time
	EndsAt    time.Time

	// PushbackHits counts how many times a landed hit has extended EndsAt -
	// see command.ApplyCastPushback.
	PushbackHits int
}
