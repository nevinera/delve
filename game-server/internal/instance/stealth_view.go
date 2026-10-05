package instance

import (
	"encoding/json"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// stealthViewEntry is one stealthed unit a player detects: where it is (the
// shared message leaves stealthed units' positions out) and how well they
// see it.
type stealthViewEntry struct {
	Position   instanceconfig.Position `json:"position"`
	Visibility command.Visibility      `json:"visibility"`
}

// stealthedUnits are this tick's living stealthed units, keyed by id.
func stealthedUnits(state *instancestate.InstanceState) map[uuid.UUID]*instancestate.UnitState {
	out := map[uuid.UUID]*instancestate.UnitState{}
	for id, u := range state.Units {
		if u.Stealthed {
			out[id] = u
		}
	}
	return out
}

// stealthView is what one player detects of the stealthed units: id → entry.
// Empty when they detect none (or have no unit yet).
func stealthView(observer *instancestate.UnitState, stealthed map[uuid.UUID]*instancestate.UnitState, zone instanceconfig.Zone) map[string]stealthViewEntry {
	if observer == nil {
		return nil
	}
	var view map[string]stealthViewEntry
	for id, u := range stealthed {
		vis := command.StealthVisibility(observer, u, zone)
		if vis == command.VisibilityHidden {
			continue
		}
		if view == nil {
			view = map[string]stealthViewEntry{}
		}
		view[id.String()] = stealthViewEntry{Position: u.Position, Visibility: vis}
	}
	return view
}

// withStealthView splices a player's stealth view onto a shared message (a
// JSON object) as "stealth_view", without re-encoding the shared part. The
// shared payload is left untouched; it's returned as-is when the view is
// empty. The client takes each message's view as the whole of it.
func withStealthView(payload []byte, view map[string]stealthViewEntry) ([]byte, error) {
	if len(view) == 0 || len(payload) < 2 {
		return payload, nil
	}
	encoded, err := json.Marshal(view)
	if err != nil {
		return nil, err
	}
	out := make([]byte, 0, len(payload)+len(encoded)+18)
	out = append(out, payload[:len(payload)-1]...)
	out = append(out, `,"stealth_view":`...)
	out = append(out, encoded...)
	return append(out, '}'), nil
}
