package game

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/rails"
)

// saveTimeout is how long one position write to Rails may take.
const saveTimeout = 10 * time.Second

// Positions keeps where characters are in a world (rails.Client).
type Positions interface {
	SavePosition(ctx context.Context, world, id int64, pos rails.Position) error
}

type saveKey struct{ world, character int64 }

// saver writes positions to Rails in the background, one at a time, so a slow Rails never holds up
// the game. It keeps only each character's latest position: a newer one replaces one not yet sent.
type saver struct {
	to      Positions
	mu      sync.Mutex
	pending map[saveKey]rails.Position
	busy    bool
	wake    chan struct{}
}

func newSaver(to Positions) *saver {
	s := &saver{to: to, pending: map[saveKey]rails.Position{}, wake: make(chan struct{}, 1)}
	go s.run()
	return s
}

func (s *saver) save(world, character int64, pos rails.Position) {
	s.mu.Lock()
	s.pending[saveKey{world, character}] = pos
	s.mu.Unlock()
	select {
	case s.wake <- struct{}{}:
	default:
	}
}

func (s *saver) run() {
	for range s.wake {
		for {
			s.mu.Lock()
			var key saveKey
			var pos rails.Position
			found := false
			for key, pos = range s.pending {
				found = true
				break
			}
			if !found {
				s.busy = false
				s.mu.Unlock()
				break
			}
			delete(s.pending, key)
			s.busy = true
			s.mu.Unlock()

			ctx, cancel := context.WithTimeout(context.Background(), saveTimeout)
			if err := s.to.SavePosition(ctx, key.world, key.character, pos); err != nil {
				slog.Warn("couldn't save a position", "world", key.world, "character", key.character, "err", err)
			}
			cancel()
		}
	}
}

// flush waits until every position given so far is written, or ctx ends.
func (s *saver) flush(ctx context.Context) error {
	for {
		s.mu.Lock()
		done := len(s.pending) == 0 && !s.busy
		s.mu.Unlock()
		if done {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(10 * time.Millisecond):
		}
	}
}
