package game

import (
	"encoding/json"
	"math"
)

// The messages of docs/formats/game-protocol.md.

// Move is how a character is moving, so others can carry it on between messages.
type Move struct {
	Forward int    `json:"forward"`
	Strafe  int    `json:"strafe"`
	Turn    int    `json:"turn"`
	Gait    string `json:"gait"`
	Swim    bool   `json:"swim"`
	Jump    bool   `json:"jump"`
}

// Character is a character as others see it.
type Character struct {
	ID        int64           `json:"id"`
	Name      string          `json:"name"`
	Look      json.RawMessage `json:"look"`
	Continent string          `json:"continent"`
	At        [3]float64      `json:"at"`
	Yaw       float64         `json:"yaw"`
	Move      Move            `json:"move"`
}

// incoming is a message from a client: move or heartbeat. T is the client's clock, in
// milliseconds.
type incoming struct {
	Type string     `json:"type"`
	T    float64    `json:"t"`
	At   [3]float64 `json:"at"`
	Yaw  float64    `json:"yaw"`
	Move *Move      `json:"move"`
}

type welcome struct {
	Type  string    `json:"type"`
	You   Character `json:"you"`
	Layer int       `json:"layer"`
}

type snapshot struct {
	Type       string      `json:"type"`
	Characters []Character `json:"characters"`
}

type appear struct {
	Type      string    `json:"type"`
	Character Character `json:"character"`
}

type vanish struct {
	Type string `json:"type"`
	ID   int64  `json:"id"`
}

type moved struct {
	Type string     `json:"type"`
	ID   int64      `json:"id"`
	At   [3]float64 `json:"at"`
	Yaw  float64    `json:"yaw"`
	Move Move       `json:"move"`
}

type correction struct {
	Type string     `json:"type"`
	At   [3]float64 `json:"at"`
	Yaw  float64    `json:"yaw"`
}

type errorMessage struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

func encode(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

// clean makes a client's movement something others can draw: steps of -1, 0 or 1 and a gait it
// knows.
func (m Move) clean() Move {
	step := func(n int) int { return max(-1, min(1, n)) }
	m.Forward, m.Strafe, m.Turn = step(m.Forward), step(m.Strafe), step(m.Turn)
	if m.Gait != "walk" && m.Gait != "sprint" {
		m.Gait = "run"
	}
	return m
}

func finite(at [3]float64, yaw float64, t float64) bool {
	for _, v := range append(at[:], t) {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return false
		}
	}
	return !math.IsNaN(yaw) && !math.IsInf(yaw, 0)
}
