// Package game holds the characters in each world: it places them on a layer, keeps track of who's
// near whom, and passes each one's movement to the characters near it.
package game

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"sync"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
	"github.com/delve-mmo/delve3d/game-server/internal/rails"
	"github.com/delve-mmo/delve3d/game-server/internal/token"
	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

// SendQueue is how many messages a player can fall behind before they're dropped.
const SendQueue = 256

// IdleUnload is how long a layer stays loaded after its last player leaves.
const IdleUnload = 5 * time.Minute

// SaveEvery is how often positions that have changed are saved, besides on leaving and on
// crossing into another plate.
const SaveEvery = 30 * time.Second

// WorldLoader gives a released world (worlds.Store).
type WorldLoader interface {
	Load(ctx context.Context, repo, sha string) (*worlds.World, error)
}

// Characters gives a character entering a world, and keeps its class and where it is (rails.Client).
type Characters interface {
	Character(ctx context.Context, world, id int64) (rails.Character, error)
	SaveClass(ctx context.Context, world, id int64, class string) error
	SaveBuild(ctx context.Context, world, id int64, specialization string, talents map[string]string) error
	SaveBars(ctx context.Context, world, id int64, bars [][]string) error
	Positions
}

// Hub holds every loaded layer.
type Hub struct {
	worlds     WorldLoader
	characters Characters
	idle       time.Duration
	saver      *saver
	now        func() time.Time
	roll       func() float64

	mu      sync.Mutex
	layers  map[string]*Layer // by world id and sha
	playing map[int64]*Player // by character id
}

func NewHub(w WorldLoader, c Characters) *Hub {
	return &Hub{worlds: w, characters: c, idle: IdleUnload, saver: newSaver(c), now: time.Now, roll: combat.Random, layers: map[string]*Layer{}, playing: map[int64]*Player{}}
}

// Layer is one copy of a world's open land and the characters in it.
type Layer struct {
	zones     []*zone // areas on the ground, oldest first
	zoneCount int64
	firing    int // how many triggers are setting each other off right now
	hub       *Hub
	key       string
	worldID   int64
	number    int
	world     *worlds.World
	grounds   map[string]*worlds.Ground // by continent, as they're needed
	// groundsMu guards grounds, apart from mu, since entering reads the ground without the layer.
	groundsMu sync.Mutex
	mu        sync.Mutex
	players   map[int64]*Player
	unload    *time.Timer
	gone      bool // unloaded, so no one joins it
	dummies   []*dummy
	landings  []*landing
	lastTick  time.Time
}

// Player is a connected character. Its connection reads Send until Gone closes.
type Player struct {
	Send   chan []byte
	Gone   chan struct{}
	layer  *Layer
	state  Character
	saved  rails.Position // the position last saved
	motion motion
	fight  fighter
	once   sync.Once
	// systemAdmin says its owner has that role, which admin commands need.
	systemAdmin bool
	// combatDebug says to log what each of its abilities comes to, for this connection.
	combatDebug bool
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
		if at, ok := layer.standing(state.Continent, state.At[0], state.At[2]); ok {
			state.At = at
		}
	}
	// Reading the plate it's on now spares the layer the wait when the first report comes.
	if g := layer.ground(state.Continent); g != nil {
		_, _, _ = g.At(state.At[0], state.At[2])
	}
	h.mu.Lock()
	old := h.playing[state.ID]
	h.mu.Unlock()
	// Still playing here: where it is now is newer than what Rails has.
	if old != nil && old.layer == layer {
		layer.mu.Lock()
		state.Continent, state.At, state.Yaw = old.state.Continent, old.state.At, old.state.Yaw
		layer.mu.Unlock()
	}
	p := &Player{Send: make(chan []byte, SendQueue), Gone: make(chan struct{}), layer: layer, state: state, motion: motion{joined: h.now()}}
	p.enterFight(classWithID(layer.world.Classes, character.Class), character.Level, combat.Build{Specialization: character.Specialization, Talents: character.Talents})
	p.fight.bars = character.Bars
	p.systemAdmin = character.SystemAdmin
	p.saved = p.position()

	h.mu.Lock()
	h.playing[state.ID] = p
	h.mu.Unlock()
	if old != nil {
		old.Drop("you entered the game somewhere else")
		h.Leave(old)
	}
	layer.join(p)
	return p, nil
}

// ClassesToPick is the ids of the classes a character entering has to choose from: none if it has
// a class the world still has, or the world has no classes.
func (h *Hub) ClassesToPick(ctx context.Context, c token.Claims) ([]string, error) {
	character, err := h.characters.Character(ctx, c.World, c.Character)
	if err != nil {
		return nil, fmt.Errorf("couldn't find your character: %w", err)
	}
	layer, err := h.layer(ctx, c)
	if err != nil {
		return nil, err
	}
	layer.unloadUnlessJoined() // someone can leave without choosing
	if classWithID(layer.world.Classes, character.Class) != nil {
		return nil, nil
	}
	ids := make([]string, len(layer.world.Classes))
	for i, class := range layer.world.Classes {
		ids[i] = class.ID
	}
	return ids, nil
}

// PickClass keeps the class a character chose, if the world has it.
func (h *Hub) PickClass(ctx context.Context, c token.Claims, id string) error {
	layer, err := h.layer(ctx, c)
	if err != nil {
		return err
	}
	if classWithID(layer.world.Classes, id) == nil {
		return fmt.Errorf("this world has no class %q", id)
	}
	if err := h.characters.SaveClass(ctx, c.World, c.Character, id); err != nil {
		return fmt.Errorf("couldn't keep your class: %w", err)
	}
	return nil
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
		h.layers[key] = &Layer{hub: h, key: key, worldID: c.World, number: 1, world: world, grounds: map[string]*worlds.Ground{}, players: map[int64]*Player{}}
	}
	return h.layers[key], nil
}

// Leave takes a player out of the game, telling those near it, and saves where it was.
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

// unloadUnlessJoined starts the idle wait on a layer with no players, which joining stops.
func (l *Layer) unloadUnlessJoined() {
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.players) == 0 && l.unload == nil && !l.gone {
		l.unload = time.AfterFunc(l.hub.idle, l.unloadIfEmpty)
	}
}

func (l *Layer) join(p *Player) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.players[p.ID()] != nil {
		l.dropFrom(p.ID()) // the same character, entering again before its old connection left
	}
	l.players[p.ID()] = p
	l.placeDummies()
	p.send(encode(welcome{"welcome", l.seen(p.state), l.number}))
	near := l.dummiesOn(p.state.Continent)
	for _, o := range l.near(p) {
		near = append(near, l.seen(o.state))
		o.send(encode(appear{"appear", l.seen(p.state)}))
	}
	p.send(encode(snapshot{"snapshot", near}))
	now := l.hub.now()
	for _, z := range l.zones {
		if _, continent, ok := z.center(); ok && continent == p.state.Continent {
			p.send(encode(l.areaMessage(z, now)))
		}
	}
	if p.fight.class != nil {
		p.send(encode(buildMessage{"build", p.fight.build.Specialization, p.fight.build.Talents}))
		if p.fight.bars != nil {
			p.send(encode(barsMessage{"bars", p.fight.bars}))
		}
	}
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
	l.dropFrom(p.ID())
	l.save(p)
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
	switch m.Type {
	case "use":
		p.layer.use(p, m)
		return nil
	case "command":
		p.layer.command(p, m.Line)
		return nil
	case "bars":
		p.layer.setBars(p, m.Bars)
		return nil
	case "build":
		p.layer.chooseBuild(p, combat.Build{Specialization: m.Specialization, Talents: m.Talents})
		return nil
	case "attack":
		p.layer.attack(p, m)
		return nil
	case "stop":
		p.layer.mu.Lock()
		defer p.layer.mu.Unlock()
		p.layer.stopCast(p)
		return nil
	case "move", "heartbeat":
	default:
		return fmt.Errorf("%w: unknown type %q", errBadMessage, m.Type)
	}
	if !finite(m.At, m.Yaw, m.T) {
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
	switch verdict, why := p.motion.check(m, p.state.At, l.hub.now(), l.ground(p.state.Continent)); verdict {
	case ignore:
		return
	case correct:
		log.Printf("character %d: corrected: %s", p.ID(), why)
		p.send(encode(correction{"correct", p.state.At, p.state.Yaw}))
		return
	case drop:
		log.Printf("character %d: dropped: %s", p.ID(), why)
		p.Drop("your movement didn't add up, so the server let you go")
		return
	}
	before := map[int64]*Player{}
	for _, o := range l.near(p) {
		before[o.ID()] = o
	}
	plate := plateOf(p.state.At)
	p.state.At, p.state.Yaw = m.At, m.Yaw
	if plateOf(p.state.At) != plate {
		l.save(p)
	}
	if m.Move != nil {
		p.state.Move = m.Move.clean()
		l.interruptMoving(p)
	}
	update := encode(moved{"moved", p.ID(), p.state.At, p.state.Yaw, p.state.Move})
	for _, o := range l.near(p) {
		if before[o.ID()] != nil {
			delete(before, o.ID())
			o.send(update)
			continue
		}
		o.send(encode(appear{"appear", l.seen(p.state)}))
		p.send(encode(appear{"appear", l.seen(o.state)}))
	}
	for _, o := range before {
		o.send(encode(vanish{"vanish", p.ID()}))
		p.send(encode(vanish{"vanish", o.ID()}))
	}
	// The jump is news once; after it the character is just in the air.
	p.state.Move.Jump = false
}

// Run saves the positions that have changed every SaveEvery, and moves combat on, until ctx ends.
func (h *Hub) Run(ctx context.Context) {
	tick := time.NewTicker(SaveEvery)
	defer tick.Stop()
	fight := time.NewTicker(CombatTick)
	defer fight.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			h.SaveAll()
		case <-fight.C:
			h.Tick()
		}
	}
}

// SaveAll saves every player's position that has changed since it was last saved.
func (h *Hub) SaveAll() {
	h.mu.Lock()
	layers := make([]*Layer, 0, len(h.layers))
	for _, l := range h.layers {
		layers = append(layers, l)
	}
	h.mu.Unlock()
	for _, l := range layers {
		l.mu.Lock()
		for _, p := range l.players {
			l.save(p)
		}
		l.mu.Unlock()
	}
}

// Flush waits for the positions given to be saved, or for ctx to end.
func (h *Hub) Flush(ctx context.Context) error {
	return h.saver.flush(ctx)
}

// save hands a player's position to the saver, if it's changed since it was last saved. The
// layer's lock is held.
func (l *Layer) save(p *Player) {
	pos := p.position()
	if pos == p.saved {
		return
	}
	p.saved = pos
	l.hub.saver.save(l.worldID, p.ID(), pos)
}

func (p *Player) position() rails.Position {
	return rails.Position{Continent: p.state.Continent, At: p.state.At, Yaw: p.state.Yaw}
}

// ground is a continent's ground, or nil where it isn't known.
func (l *Layer) ground(continent string) Ground {
	l.groundsMu.Lock()
	defer l.groundsMu.Unlock()
	g, read := l.grounds[continent]
	if !read {
		g = l.world.Ground(continent)
		l.grounds[continent] = g
	}
	if g == nil {
		return nil
	}
	return g
}

func plateOf(at [3]float64) [2]int {
	return [2]int{int(math.Floor(at[0] / worlds.PlateFt)), int(math.Floor(at[2] / worlds.PlateFt))}
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
