package game

import (
	"encoding/json"
	"math"
)

//go:generate go run ../../cmd/messages

// The messages are in messages_gen.go, written from docs/schema/messages.schema.json.

// encoded, when set, sees every message the server encodes. Tests check them against
// docs/schema/messages.schema.json.
var encoded func(b []byte)

func encode(v any) []byte {
	b, _ := json.Marshal(v)
	if encoded != nil {
		encoded(b)
	}
	return b
}

// clean makes a client's movement something others can draw: steps of -1, 0 or 1 and a gait it
// knows.
func (m Move) clean() Move {
	step := func(n int) int { return max(-1, min(1, n)) }
	m.Forward, m.Strafe, m.Turn = step(m.Forward), step(m.Strafe), step(m.Turn)
	if m.Gait != "walk" {
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
