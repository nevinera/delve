package instance

import "sync"

// Registry holds the collection of running game instances. It is the only
// place where the instance map is accessed; all callers go through its methods.
//
// Concurrency: Add and Remove take the write lock; Count takes the read lock.
// Instance state itself is not protected here — each instance will be owned
// exclusively by its tick-loop goroutine once instances are introduced.
type Registry struct {
	mu    sync.RWMutex
	count int
}

func NewRegistry() *Registry {
	return &Registry{}
}

// Count returns the number of currently running instances.
func (r *Registry) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.count
}
