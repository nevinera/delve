package instanceconfig

import (
	"bytes"
	"encoding/json"
	"errors"
)

// CharacterClass defines the abilities and appearance of a player character.
// The game server always receives fully-resolved configs — all AssetReferences
// must be inlined before delivery. graphicEffects and soundEffects on powers
// are client-only and omitted.
type CharacterClass struct {
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	Colors      Colors         `json:"colors"`
	Resources   []ResourceType `json:"resources,omitempty"`
	Powers      []Power        `json:"powers,omitempty"`
}

func (c *CharacterClass) UnmarshalJSON(data []byte) error {
	if bytes.Contains(data, []byte(`"$ref"`)) {
		return errors.New(
			`character class config contains an unresolved AssetReference ("$ref"); ` +
				`the Rails app must send a fully-resolved concrete config`,
		)
	}
	type plain CharacterClass
	return json.Unmarshal(data, (*plain)(c))
}

// Colors holds the two display colors for a character class.
// Values are 6-digit hex strings without a leading '#'.
type Colors struct {
	Major string `json:"major"`
	Minor string `json:"minor"`
}
