package bot

import (
	"encoding/json"
	"errors"
	"io"
	"math"
	"testing"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

// script is a connection a test scripts: each read gives the next batch of messages, and it closes
// after the last.
type script struct {
	batches [][]string
	sent    []any
	closed  bool
}

func (s *script) Read(time.Duration) []Message {
	time.Sleep(110 * time.Millisecond)
	if len(s.batches) == 0 {
		s.closed = true
		return nil
	}
	var got []Message
	for _, raw := range s.batches[0] {
		var m Message
		if err := json.Unmarshal([]byte(raw), &m); err != nil {
			panic(err)
		}
		m.Raw = []byte(raw)
		got = append(got, m)
	}
	s.batches = s.batches[1:]
	return got
}

func (s *script) Send(v any)                       { s.sent = append(s.sent, v) }
func (s *script) Closed() (bool, string)           { return s.closed, "done" }
func (s *script) Close(time.Duration, func() bool) { s.closed = true }

func (s *script) moves() (moves []move) {
	for _, v := range s.sent {
		if m, ok := v.(move); ok {
			moves = append(moves, m)
		}
	}
	return moves
}

// level is ground 7 ft up everywhere.
type level struct{}

func (level) At(float64, float64) (worlds.Sample, bool, error) {
	return worlds.Sample{Ground: 7, Water: math.NaN()}, true, nil
}
func (level) Enters([3]float64, [3]float64) (string, error) { return "", nil }

const welcome = `{"type":"welcome","you":{"id":1,"name":"Botty","continent":"main","at":[0,5,0],"yaw":0}}`

func run(strategy Strategy, batches ...[]string) *script {
	conn := &script{batches: batches}
	r := &Runner{Conn: conn, Strategy: strategy, Log: NewLog(io.Discard, 0), Ground: func(string) Ground { return level{} }}
	r.Run()
	return conn
}

func TestPicksTheFirstClassOffered(t *testing.T) {
	conn := run(Null{}, []string{`{"type":"pickClass","classes":["frst0001","fire0001"]}`}, []string{welcome})
	if len(conn.sent) == 0 || conn.sent[0] != (pick{Type: "pick", Class: "frst0001"}) {
		t.Errorf("sent %+v", conn.sent)
	}
}

func TestReportsWhereItEntersOnTheGround(t *testing.T) {
	conn := run(Null{}, []string{welcome})
	if m := conn.moves(); len(m) == 0 || m[0].Type != "move" || m[0].At != [3]float64{0, 7, 0} {
		t.Errorf("sent %+v", conn.sent)
	}
}

func TestFollowsACharacter(t *testing.T) {
	follow, err := Build("follow", map[string]any{"target": "arwen", "stop_feet": 5.0})
	if err != nil {
		t.Fatal(err)
	}
	arwen := `{"type":"snapshot","characters":[{"id":99,"name":"Arwen","continent":"main","at":[30,7,0],"yaw":0,"move":{}}]}`
	conn := run(follow, []string{welcome, arwen}, nil, nil, nil, nil)
	moves := conn.moves()
	if moves[0].Move.Forward != 1 || math.Abs(moves[0].Yaw-math.Pi/2) > 0.01 {
		t.Errorf("first move %+v", moves[0])
	}
	if last := moves[len(moves)-1]; last.At[0] <= 5 || last.At[1] != 7 {
		t.Errorf("last %+v", last)
	}
}

func TestTakesTheGroundWhereItsMoved(t *testing.T) {
	var asked []string
	conn := &script{batches: [][]string{{welcome}, {`{"type":"teleport","continent":"isle","at":[50,9,50],"yaw":1}`}}}
	r := &Runner{Conn: conn, Strategy: Null{}, Log: NewLog(io.Discard, 0), Ground: func(c string) Ground { asked = append(asked, c); return level{} }}
	r.Run()
	if len(asked) != 2 || asked[1] != "isle" {
		t.Errorf("asked for %v", asked)
	}
	if m := conn.moves(); m[len(m)-1].At != [3]float64{50, 7, 50} {
		t.Errorf("last %+v", m[len(m)-1])
	}
}

func TestStrategyConfig(t *testing.T) {
	for _, c := range []struct {
		name   string
		config map[string]any
	}{
		{"follow", map[string]any{}},
		{"follow", map[string]any{"target": "a", "stop_feet": -1.0}},
		{"follow", map[string]any{"target": "a", "stop_feet": 200.0}},
		{"dance", nil},
	} {
		if _, err := Build(c.name, c.config); !errors.Is(err, ErrConfig) {
			t.Errorf("%s %v: %v", c.name, c.config, err)
		}
	}
	if f, err := Build("follow", map[string]any{"target": "a", "notice_feet": "50"}); err != nil || f.(*Follow).Notice != 50 {
		t.Errorf("%+v, %v", f, err)
	}
}
