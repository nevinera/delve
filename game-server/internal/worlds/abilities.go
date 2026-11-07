package worlds

import (
	"archive/zip"
	"encoding/json"
	"log"
	"path/filepath"
	"slices"
	"strings"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// AbilityPick is one of a creature's abilities: the id of one of the world's own, from
// abilities/<id>.json.
type AbilityPick struct {
	ID string `json:"id"`
}

func (p *AbilityPick) UnmarshalJSON(b []byte) error {
	var id string
	if err := json.Unmarshal(b, &id); err == nil {
		*p = AbilityPick{ID: id}
		return nil
	}
	type plain AbilityPick
	return json.Unmarshal(b, (*plain)(p))
}

// readGameData reads every <dir>/<id>.json into a T, in order of id, leaving out any it can't read.
func readGameData[T any](files map[string]*zip.File, dir string, id func(*T) string) []T {
	var paths []string
	for name := range files {
		if d, file := filepath.Split(name); d == dir+"/" && strings.HasSuffix(file, ".json") {
			paths = append(paths, name)
		}
	}
	slices.Sort(paths)
	out := []T{}
	for _, path := range paths {
		var v T
		if err := readJSON(files, path, &v); err != nil || id(&v) == "" {
			log.Printf("worlds: skipping %s: %v", path, err)
			continue
		}
		out = append(out, v)
	}
	return out
}

// kitOf is what a creature casts with: a class with the id creatures/<id>, of its abilities, the
// world's statuses and its resource, or nil if it has no abilities the world has. Play builds the
// same from the files (client/src/play/creatureKit.js).
func kitOf(c *Creature, abilities []combat.Ability, statuses []combat.Status) *combat.Class {
	kit := &combat.Class{ID: "creatures/" + c.ID, Name: c.Name, Statuses: statuses}
	for _, pick := range c.Abilities {
		i := slices.IndexFunc(abilities, func(a combat.Ability) bool { return a.ID == pick.ID })
		if i < 0 {
			log.Printf("worlds: creature %s has an ability there isn't: %s", c.ID, pick.ID)
			continue
		}
		kit.Abilities = append(kit.Abilities, abilities[i])
	}
	if c.OnDeath != "" {
		if i := slices.IndexFunc(abilities, func(a combat.Ability) bool { return a.ID == c.OnDeath }); i >= 0 && kit.Ability(c.OnDeath) == nil {
			kit.Abilities = append(kit.Abilities, abilities[i])
		}
	}
	if len(kit.Abilities) == 0 {
		return nil
	}
	if c.Resource != nil {
		kit.Resources = []combat.Resource{*c.Resource}
	}
	return kit
}
