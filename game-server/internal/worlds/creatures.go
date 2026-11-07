package worlds

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"log"
	"path/filepath"
	"slices"
	"strings"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// Creature is a kind of mob, from creatures/<id>.json: as much of it as the game server plays.
type Creature struct {
	ID             string          `json:"id"`
	Name           string          `json:"name"`
	Look           json.RawMessage `json:"look"`
	CreatureType   string          `json:"creatureType"`
	Reach          float64         `json:"reach"`
	Classification string          `json:"classification"`
	Health         float64         `json:"health"` // multiplies what its level and classification give
	Damage         float64         `json:"damage"`
	Armor          float64         `json:"armor"`
	Reaction       string          `json:"reaction"` // hostile, or neutral
	AggroRadius    float64         `json:"aggroRadius"`
	Attack         struct {
		Speed  float64         `json:"speed"`
		Range  combat.Distance `json:"range"`
		School string          `json:"school"`
	} `json:"attack"`
	Speed float64 `json:"speed"`
}

// Levels is a level, or the lowest and highest a mob can be.
type Levels [2]int

func (l *Levels) UnmarshalJSON(b []byte) error {
	var one int
	if err := json.Unmarshal(b, &one); err == nil {
		*l = Levels{one, one}
		return nil
	}
	var two []int
	if err := json.Unmarshal(b, &two); err != nil || len(two) != 2 {
		return fmt.Errorf("levels: want a level or [min, max], got %s", b)
	}
	*l = Levels{min(two[0], two[1]), max(two[0], two[1])}
	return nil
}

// Placed is a mob placed by hand on a continent, from its spawns.json.
type Placed struct {
	ID        string     `json:"id"`
	Creature  string     `json:"creature"`
	Continent string     `json:"-"`
	At        [3]float64 `json:"at"`
	Yaw       float64    `json:"yaw"`
	Levels    Levels     `json:"levels"`
	Respawn   float64    `json:"respawn"` // seconds after it dies
	Wander    *float64   `json:"wander"`  // how far it strays from where it spawned, or nil for the default
}

// Creature is the creature with that id, or nil.
func (w *World) Creature(id string) *Creature {
	i, found := slices.BinarySearchFunc(w.Creatures, id, func(c *Creature, id string) int { return strings.Compare(c.ID, id) })
	if !found {
		return nil
	}
	return w.Creatures[i]
}

// readCreatures reads creatures/<id>.json, in order of id, leaving out any it can't read.
func readCreatures(files map[string]*zip.File) []*Creature {
	var paths []string
	for name := range files {
		if dir, file := filepath.Split(name); dir == "creatures/" && strings.HasSuffix(file, ".json") {
			paths = append(paths, name)
		}
	}
	slices.Sort(paths)
	out := []*Creature{}
	for _, path := range paths {
		c := &Creature{}
		if err := readJSON(files, path, c); err != nil || c.ID == "" {
			log.Printf("worlds: skipping a creature: %s: %v", path, err)
			continue
		}
		out = append(out, c)
	}
	slices.SortFunc(out, func(a, b *Creature) int { return strings.Compare(a.ID, b.ID) })
	return out
}

// readPlacedMobs reads the creatures placed by hand in each continent's spawns.json. A spawns file
// that's missing places none. Placed NPCs are left out, and so are placed mobs it can't read or
// whose creature the world hasn't got, which are logged.
func readPlacedMobs(files map[string]*zip.File, continents []string, creatures func(string) *Creature) []Placed {
	out := []Placed{}
	for _, continent := range continents {
		path := "places/continents/" + continent + "/spawns.json"
		if files[path] == nil {
			continue
		}
		var spawns struct {
			Placed []json.RawMessage `json:"placed"`
		}
		if err := readJSON(files, path, &spawns); err != nil {
			log.Printf("worlds: skipping %s: %v", path, err)
			continue
		}
		for i, raw := range spawns.Placed {
			var p Placed
			if err := json.Unmarshal(raw, &p); err != nil {
				log.Printf("worlds: %s: skipping placed %d: %v", path, i, err)
				continue
			}
			if p.Creature == "" {
				continue // an NPC: not played yet
			}
			if creatures(p.Creature) == nil {
				log.Printf("worlds: %s: %s places a creature there isn't: %s", path, p.ID, p.Creature)
				continue
			}
			p.Continent = continent
			p.Levels[0], p.Levels[1] = max(p.Levels[0], 1), max(p.Levels[1], 1)
			out = append(out, p)
		}
	}
	return out
}
