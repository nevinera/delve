// Package game holds the characters in each world: it places them on a layer, keeps track of who's
// near whom, and passes each one's movement to the characters near it.
package game

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/rails"
	"github.com/delve-mmo/delve3d/game-server/internal/token"
	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

// SendQueue is how many messages a player can fall behind before they're dropped.
const SendQueue = 256

// IdleUnload is how long a layer stays loaded after its last player leaves.
const IdleUnload = 5 * time.Minute

// WorldLoader gives a released world (worlds.Store).
type WorldLoader interface {
	Load(ctx context.Context, repo, sha string) (*worlds.World, error)
}

// Characters gives a character entering a world (rails.Client).
type Characters interface {
	Character(ctx context.Context, world, id int64) (rails.Character, error)
}

// Hub holds every loaded layer.
type Hub struct {
	worlds     WorldLoader
	characters Characters
	idle       time.Duration

	mu      sync.Mutex
	layers  map[string]*Layer // by world id and sha
	playing map[int64]*Player // by character id
}

func NewHub(w WorldLoader, c Characters) *Hub {
	return &Hub{worlds: w, characters: c, idle: IdleUnload, layers: map[string]*Layer{}, playing: map[int64]*Player{}}
}

// Layer is one copy of a world's open land and the characters in it.
type Layer struct {
	hub     *Hub
	key     string
	number  int
	world   *worlds.World
	mu      sync.Mutex
	players map[int64]*Player
	unload  *time.Timer
	gone    bool // unloaded, so no one joins it
}

// Player is a connected character. Its connection reads Send until Gone closes.
type Player struct {
	Send  chan []byte
	Gone  chan struct{}
	layer *Layer
	state Character
	once  sync.Once
}

// ID is the player's character id.
func (p *Player) ID() int64 { return p.state.ID }

// Drop ends the player's connection, with a message saying why when there's one.
func (p *Player) Drop(reason string) {
	p.once.Do(func() {
		if reason != "" {
			select {
			case p.Send <- encode(errorMessage{"error", reason}):
			default:
			}
		}
		close(p.Gone)
	})
}

func (p *Player) send(b []byte) {
	select {
	case <-p.Gone:
	case p.Send <- b:
	default:
		p.Drop("")
	}
}

// Enter places the character a token names: on its world's layer, where it last was there or at
// the spawn point. A character already playing is dropped from where it was.
func (h *Hub) Enter(ctx context.Context, c token.Claims) (*Player, error) {
	character, err := h.characters.Character(ctx, c.World, c.Character)
	if err != nil {
		return nil, fmt.Errorf("couldn't find your character: %w", err)
	}
	layer, err := h.layer(ctx, c)
	if err != nil {
		return nil, err
	}
	// A layer can unload between finding it and joining it; then it's loaded again.
	for !layer.joinable() {
		if layer, err = h.layer(ctx, c); err != nil {
			return nil, err
		}
	}
	state := Character{ID: character.ID, Name: character.Name, Look: character.Look, Move: Move{Gait: "run"}}
	if len(state.Look) == 0 {
		state.Look = json.RawMessage("{}")
	}
	if pos := character.Position; pos != nil && pos.Continent != "" {
		state.Continent, state.At, state.Yaw = pos.Continent, pos.At, pos.Yaw
	} else {
		state.Continent, state.At = layer.world.Spawn.Continent, layer.world.SpawnAt()
	}
	p := &Player{Send: make(chan []byte, SendQueue), Gone: make(chan struct{}), layer: layer, state: state}

	h.mu.Lock()
	old := h.playing[state.ID]
	h.playing[state.ID] = p
	h.mu.Unlock()
	if old != nil {
		old.Drop("you entered the game somewhere else")
		h.Leave(old)
	}
	layer.join(p)
	return p, nil
}

// layer finds, or loads, the layer a token's world is on.
func (h *Hub) layer(ctx context.Context, c token.Claims) (*Layer, error) {
	key := fmt.Sprintf("%d@%s", c.World, c.Sha)
	h.mu.Lock()
	layer := h.layers[key]
	h.mu.Unlock()
	if layer != nil {
		return layer, nil
	}
	world, err := h.worlds.Load(ctx, c.Repo, c.Sha)
	if err != nil {
		return nil, fmt.Errorf("couldn't load the world: %w", err)
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.layers[key] == nil {
		h.layers[key] = &Layer{hub: h, key: key, number: 1, world: world, players: map[int64]*Player{}}
	}
	return h.layers[key], nil
}

// Leave takes a player out of the game, telling those near it.
func (h *Hub) Leave(p *Player) {
	p.Drop("")
	h.mu.Lock()
	if h.playing[p.ID()] == p {
		delete(h.playing, p.ID())
	}
	h.mu.Unlock()
	p.layer.leave(p)
}

// Layers is how many layers are loaded.
func (h *Hub) Layers() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.layers)
}

// joinable keeps the layer loaded, unless it's unloaded already.
func (l *Layer) joinable() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.unload != nil {
		l.unload.Stop()
		l.unload = nil
	}
	return !l.gone
}

func (l *Layer) join(p *Player) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.players[p.ID()] = p
	p.send(encode(welcome{"welcome", p.state, l.number}))
	near := []Character{}
	for _, o := range l.near(p) {
		near = append(near, o.state)
		o.send(encode(appear{"appear", p.state}))
	}
	p.send(encode(snapshot{"snapshot", near}))
}

func (l *Layer) leave(p *Player) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.players[p.ID()] != p {
		return
	}
	for _, o := range l.near(p) {
		o.send(encode(vanish{"vanish", p.ID()}))
	}
	delete(l.players, p.ID())
	if len(l.players) == 0 {
		l.unload = time.AfterFunc(l.hub.idle, l.unloadIfEmpty)
	}
}

func (l *Layer) unloadIfEmpty() {
	l.hub.mu.Lock()
	defer l.hub.mu.Unlock()
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.players) == 0 && l.unload != nil && l.hub.layers[l.key] == l {
		delete(l.hub.layers, l.key)
		l.gone = true
	}
}

var errBadMessage = errors.New("bad message")

// Handle takes a message from a player's client.
func (p *Player) Handle(raw []byte) error {
	var m incoming
	if err := json.Unmarshal(raw, &m); err != nil {
		return errBadMessage
	}
	if m.Type != "move" && m.Type != "heartbeat" {
		return fmt.Errorf("%w: unknown type %q", errBadMessage, m.Type)
	}
	if !finite(m.At, m.Yaw) {
		return errBadMessage
	}
	p.layer.moved(p, m)
	return nil
}

// moved updates where a player is and tells those near it, before and after: characters coming
// into each other's area appear to each other, those leaving it vanish, and those near see it move.
func (l *Layer) moved(p *Player, m incoming) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.players[p.ID()] != p {
		return
	}
	before := map[int64]*Player{}
	for _, o := range l.near(p) {
		before[o.ID()] = o
	}
	p.state.At, p.state.Yaw = m.At, m.Yaw
	if m.Move != nil {
		p.state.Move = m.Move.clean()
	}
	update := encode(moved{"moved", p.ID(), p.state.At, p.state.Yaw, p.state.Move})
	for _, o := range l.near(p) {
		if before[o.ID()] != nil {
			delete(before, o.ID())
			o.send(update)
			continue
		}
		o.send(encode(appear{"appear", p.state}))
		p.send(encode(appear{"appear", o.state}))
	}
	for _, o := range before {
		o.send(encode(vanish{"vanish", p.ID()}))
		p.send(encode(vanish{"vanish", o.ID()}))
	}
	// The jump is news once; after it the character is just in the air.
	p.state.Move.Jump = false
}

// near is everyone else in the 3×3 tiles around p, on its continent. It looks at every player in
// the layer, which is fine while layers are small.
func (l *Layer) near(p *Player) []*Player {
	tile := worlds.TileOf(p.state.At[0], p.state.At[2])
	var out []*Player
	for _, o := range l.players {
		if o == p || o.state.Continent != p.state.Continent {
			continue
		}
		t := worlds.TileOf(o.state.At[0], o.state.At[2])
		if abs(t[0]-tile[0]) <= 1 && abs(t[1]-tile[1]) <= 1 {
			out = append(out, o)
		}
	}
	return out
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}
