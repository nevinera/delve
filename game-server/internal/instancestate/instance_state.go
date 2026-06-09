package instancestate

import (
	"github.com/google/uuid"
)

// InstanceState is the full runtime state of one zone instance.
// It is pure data: the tick system reads and writes it; no behavior lives here.
type InstanceState struct {
	Units map[uuid.UUID]*UnitState
}
