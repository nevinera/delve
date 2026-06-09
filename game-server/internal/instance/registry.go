package instance

import (
	"sync"

	"github.com/google/uuid"
)

// Registry holds the collection of running game instances and is safe for
// concurrent use.
//
// Concurrency model:
//   - Add and Remove take the write lock because they structurally modify the
//     map. External goroutines (HTTP handlers, future management APIs) need to
//     add and remove instances, so the map must be protected.
//   - Get, List, and Count take the read lock, allowing multiple concurrent
//     readers without blocking each other.
//   - Instance *state* (positions, HP, etc.) is NOT protected here. Each
//     instance will be owned exclusively by its tick-loop goroutine; only that
//     goroutine writes instance state, so no mutex is needed on the instance
//     itself. This is a deliberate design choice: a per-instance mutex would
//     add overhead on every tick and invite incorrect usage by callers who
//     assume they can safely read mid-tick.
type Registry struct {
	mu        sync.RWMutex
	instances map[uuid.UUID]*Instance
}

func NewRegistry() *Registry {
	return &Registry{
		instances: make(map[uuid.UUID]*Instance),
	}
}

func (r *Registry) Add(inst *Instance) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.instances[inst.Identifier] = inst
}

func (r *Registry) Remove(id uuid.UUID) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.instances, id)
}

func (r *Registry) Get(id uuid.UUID) (*Instance, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	inst, ok := r.instances[id]
	return inst, ok
}

// List returns a snapshot of all current instances. The slice is safe to use
// after the read lock is released; callers must not mutate instance state.
func (r *Registry) List() []*Instance {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]*Instance, 0, len(r.instances))
	for _, inst := range r.instances {
		out = append(out, inst)
	}
	return out
}

func (r *Registry) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.instances)
}
