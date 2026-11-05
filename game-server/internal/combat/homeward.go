package combat

import (
	_ "embed"
	"encoding/json"
	"slices"
)

// HomewardID is the ability every class has that takes a character home: it has no effects of its
// own, and the game server moves the character when it's let go.
const HomewardID = "homeward"

// homeward.json is the same as client/src/abilities/homeward.json, which the client adds to classes.
//
//go:embed homeward.json
var homewardJSON []byte

var homeward = func() Ability {
	var a Ability
	if err := json.Unmarshal(homewardJSON, &a); err != nil {
		panic(err)
	}
	return a
}()

// WithHomeward gives a class Homeward, in place of any ability of its own with that id.
func (c *Class) WithHomeward() {
	c.Abilities = slices.DeleteFunc(c.Abilities, func(a Ability) bool { return a.ID == HomewardID })
	c.Abilities = append(c.Abilities, homeward)
}
