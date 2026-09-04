package instancestate

import (
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
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

// UnitStatus is the lifecycle/combat state of a unit.
type UnitStatus string

const (
	UnitStatusIdle     UnitStatus = "idle"
	UnitStatusEngaged  UnitStatus = "engaged"
	UnitStatusLeashing UnitStatus = "leashing"
	UnitStatusDead     UnitStatus = "dead"
)

// ActiveStatusEffect is a status effect currently applied to a unit.
type ActiveStatusEffect struct {
	StatusIdentifier string
	ExpiresAt        time.Time
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

	Health      float64
	MaxHealth   float64 // cached from UnitType.MaxHP at spawn
	Resource    float64 // current resource value
	MaxResource float64 // cached from UnitType.Resource.Max at spawn
	Speed       float64 // movement speed in feet per second
	Radius      float64 // collision radius in feet; 0 means no collision (NPCs for now)

	// Player-only combat inputs, cached from the InstanceSlot at spawn; nil/""
	// for NPCs. EquippedItems carries each item's own elvl so combat math can
	// scale it against the unit's *current* map (see instanceconfig.Zone.MapElvl)
	// rather than a value fixed at spawn - see docs/stats.md.
	EquippedItems map[string]instanceconfig.EquippedItem
	DamageStatKey string // "strength", "agility", or "" - see CharacterClass.DamageStatKey

	LootTable map[string]int    // identifier → weight; nil means no loot
	LootCount [2]int            // [min, max] items to award; both 1 when lootCount omitted
	LootItems []PendingLootItem // rolled at death; nil until the unit dies

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
}
