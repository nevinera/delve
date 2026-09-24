package instance

import (
	"context"
	"log/slog"
	"math/rand"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/pathing"
	"github.com/delve-mmo/game-server/internal/railsclient"
)

// fallbackPathingRadius sizes the pathing graph on maps with no units
// placed on them at all (see pathing.Build). Matches UnitType.TokenRadius's
// documented minimum.
const fallbackPathingRadius = 1.0

// Status is the lifecycle state of an Instance.
type Status string

const (
	StatusLoading  Status = "loading"
	StatusActive   Status = "active"
	StatusStopping Status = "stopping"
)

// DefaultMaxSlots is the slot capacity used when no override is provided.
const DefaultMaxSlots = 25

// Instance represents one running game zone.
//
// ZoneConfig is immutable after construction: it is set once by NewInstance
// and never written again. No synchronization is needed for reads of ZoneConfig.
//
// All other mutable fields are owned exclusively by the instance's tick-loop
// goroutine (introduced in a later step) and must not be read or written by
// any other goroutine without going through the instance's command channel.
type Instance struct {
	Identifier     uuid.UUID
	DatabaseID     string
	ZoneIdentifier string
	Version        string
	SourceURL      string
	MaxSlots       int
	Status         Status
	ZoneConfig     instanceconfig.Zone
	CreatedAt      time.Time

	// PathGraph is a precomputed visibility graph used by chasing NPCs to
	// detour around obstacles when they lose direct line of sight to their
	// target. Built once in NewInstance from ZoneConfig (immutable, same as
	// ZoneConfig itself); nil if it failed to build, in which case chasing
	// units fall back to straight-line pursuit. Not shared across separate
	// Instances of the same zone.
	PathGraph *pathing.Graph

	// Rand is the source for every random roll this instance's tick loop
	// and command handlers make (combat avoidance/miss/crit/variance, loot,
	// NPC wander/patrol) - see docs on the individual functions that take
	// it. Seeded from a real (time-based) source in NewInstance; a test can
	// override it with a fixed-seed *rand.Rand for a fully reproducible run
	// instead of math/rand's package-level global, which is what made a
	// test like TestUsePowerHandler_HealScalesWithRecipientsRecoveryRating
	// flaky before this field existed. Must be set before Start() if
	// overridden, same as EmptyTimeout/SlotWaitTimeout below - the tick loop
	// and BasicAttackHandler/UsePowerHandler (wired up in NewInstance) all
	// capture it once, not read it fresh each use.
	Rand *rand.Rand

	Checksum string // SHA256 of canonical state JSON; updated every tick

	// EmptyTimeout overrides EmptyInstanceTimeout when non-zero. Intended for
	// tests that need a shorter idle period without changing the global constant.
	// Must be set before Start() is called.
	EmptyTimeout time.Duration

	// SlotWaitTimeout overrides SlotWaitingTimeout when non-zero. Intended for
	// tests. Must be set before Start() is called.
	SlotWaitTimeout time.Duration

	// RailsClient is used by the tick loop to award looted items. May be nil
	// (e.g. in tests), in which case loot claims resolve as failures.
	RailsClient *railsclient.Client

	slots                 map[uuid.UUID]*InstanceSlot
	slotsMu               sync.RWMutex
	atomicSlotCount       atomic.Int64
	atomicActiveSlotCount atomic.Int64

	playerSpawnCh       chan playerSpawn
	commandCh           chan command.Command
	commandProcessor    *command.CommandProcessor
	autoUpgradeResultCh chan autoUpgradeResult

	cancel context.CancelFunc
	done   chan struct{}
}

// NewInstance constructs a fully initialized Instance from the fields provided
// by the Rails create request. Status starts as StatusLoading; the tick loop
// will transition it to StatusActive once the instance is ready.
func NewInstance(
	id uuid.UUID,
	databaseID string,
	zoneIdentifier string,
	version string,
	sourceURL string,
	zone instanceconfig.Zone,
	maxSlots int,
) *Instance {
	inst := &Instance{
		Identifier:          id,
		DatabaseID:          databaseID,
		ZoneIdentifier:      zoneIdentifier,
		Version:             version,
		SourceURL:           sourceURL,
		MaxSlots:            maxSlots,
		Status:              StatusLoading,
		ZoneConfig:          zone,
		CreatedAt:           time.Now(),
		Rand:                rand.New(rand.NewSource(time.Now().UnixNano())),
		slots:               make(map[uuid.UUID]*InstanceSlot),
		playerSpawnCh:       make(chan playerSpawn, DefaultMaxSlots),
		commandCh:           make(chan command.Command, DefaultMaxSlots*8),
		commandProcessor:    command.NewCommandProcessor(),
		autoUpgradeResultCh: make(chan autoUpgradeResult, 256),
	}
	inst.commandProcessor.Register(command.MoveHandler{})
	inst.commandProcessor.Register(command.TargetHandler{})
	inst.commandProcessor.Register(command.StartAttackingHandler{})
	inst.commandProcessor.Register(command.StopAttackingHandler{})
	// BasicAttackHandler/UsePowerHandler are registered in Start instead,
	// once inst.Rand is final - see its own comment.
	inst.commandProcessor.Register(command.RespawnHandler{})
	inst.commandProcessor.Register(command.LootItemHandler{})

	if graph, err := pathing.Build(zone, fallbackPathingRadius); err != nil {
		slog.Error("pathing graph build failed; chasing units will fall back to straight-line pursuit",
			"zoneIdentifier", zoneIdentifier, "error", err)
	} else {
		inst.PathGraph = graph
	}

	return inst
}

// slotByUnitID returns the slot whose CharacterUnitID matches, or nil.
// Called from the tick goroutine; acquires a read lock.
func (inst *Instance) slotByUnitID(unitID uuid.UUID) *InstanceSlot {
	inst.slotsMu.RLock()
	defer inst.slotsMu.RUnlock()
	for _, s := range inst.slots {
		if s.CharacterUnitID == unitID {
			return s
		}
	}
	return nil
}

// SendCommand enqueues a command for processing on the next tick.
// Non-blocking: if the channel is full the command is silently dropped.
func (inst *Instance) SendCommand(cmd command.Command) {
	select {
	case inst.commandCh <- cmd:
	default:
	}
}
