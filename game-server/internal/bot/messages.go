package bot

import (
	"encoding/json"

	"github.com/delve-mmo/delve3d/game-server/internal/game"
)

// Message is a message from the game server (.agents/formats.md), with the fields the bot reads.
type Message struct {
	Type       string           `json:"type"`
	You        *game.Character  `json:"you"`        // welcome
	Characters []game.Character `json:"characters"` // snapshot
	Character  *game.Character  `json:"character"`  // appear
	ID         int64            `json:"id"`         // vanish, moved
	At         *[3]float64      `json:"at"`         // moved, correct, teleported
	Yaw        float64          `json:"yaw"`
	Move       *game.Move       `json:"move"`
	Continent  string           `json:"continent"` // teleported
	Classes    []string         `json:"classes"`   // pickClass
	Message    string           `json:"message"`   // error

	Raw json.RawMessage `json:"-"`
}

// move and heartbeat are what the bot sends of its movement. T is its clock, in milliseconds.
type move struct {
	Type string     `json:"type"`
	T    float64    `json:"t"`
	At   [3]float64 `json:"at"`
	Yaw  float64    `json:"yaw"`
	Move *game.Move `json:"move,omitempty"`
}

type pick struct {
	Type  string `json:"type"`
	Class string `json:"class"`
}

func encode(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
