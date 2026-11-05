package combat

import (
	_ "embed"
	"encoding/json"
	"slices"
)

// What every class has, besides its own:
//   - Homeward, an ability that takes a character home. It has no effects of its own, and the game
//     server moves the character when it's let go.
//   - Resting, a status the game server puts on a character in a rest point's area.
const (
	HomewardID = "homeward"
	RestingID  = "resting"
)

// builtins.json is the same as client/src/abilities/builtins.json, which the client adds to classes.
//
//go:embed builtins.json
var builtinsJSON []byte

var builtins = func() struct {
	Abilities []Ability `json:"abilities"`
	Statuses  []Status  `json:"statuses"`
} {
	var b struct {
		Abilities []Ability `json:"abilities"`
		Statuses  []Status  `json:"statuses"`
	}
	if err := json.Unmarshal(builtinsJSON, &b); err != nil {
		panic(err)
	}
	return b
}()

// WithBuiltins gives a class what every class has, in place of any of its own with the same ids.
func (c *Class) WithBuiltins() {
	for _, a := range builtins.Abilities {
		c.Abilities = slices.DeleteFunc(c.Abilities, func(o Ability) bool { return o.ID == a.ID })
		c.Abilities = append(c.Abilities, a)
	}
	for _, s := range builtins.Statuses {
		c.Statuses = slices.DeleteFunc(c.Statuses, func(o Status) bool { return o.ID == s.ID })
		c.Statuses = append(c.Statuses, s)
	}
}
