package instance

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/zoneconfig"
)

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
	ZoneConfig     zoneconfig.Zone
	CreatedAt      time.Time

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
	zone zoneconfig.Zone,
) *Instance {
	return &Instance{
		Identifier:     id,
		DatabaseID:     databaseID,
		ZoneIdentifier: zoneIdentifier,
		Version:        version,
		SourceURL:      sourceURL,
		MaxSlots:       DefaultMaxSlots,
		Status:         StatusLoading,
		ZoneConfig:     zone,
		CreatedAt:      time.Now(),
	}
}
