package bot

import (
	"math"
	"strings"

	"github.com/delve-mmo/delve3d/game-server/internal/game"
)

// State is what the bot knows: itself, from the server's welcome, and the characters near it, as
// the server reports them. Positions are continent feet [x, y, z].
type State struct {
	Me     *game.Character
	Others map[int64]*game.Character
}

func NewState() *State { return &State{Others: map[int64]*game.Character{}} }

func (s *State) Entered() bool { return s.Me != nil }

func (s *State) Apply(m Message) {
	switch m.Type {
	case "welcome":
		s.Me = m.You
	case "snapshot":
		for i := range m.Characters {
			c := m.Characters[i]
			s.Others[c.ID] = &c
		}
	case "appear":
		if m.Character != nil {
			s.Others[m.Character.ID] = m.Character
		}
	case "vanish":
		delete(s.Others, m.ID)
	case "moved":
		if c := s.Others[m.ID]; c != nil && m.At != nil {
			c.At, c.Yaw = *m.At, m.Yaw
			if m.Move != nil {
				c.Move = *m.Move
			}
		}
	case "teleport":
		if s.Me != nil && m.At != nil {
			s.Me.Continent, s.Me.At, s.Me.Yaw = m.Continent, *m.At, m.Yaw
		}
	}
}

// Named is a character near the bot by name, ignoring case, or nil.
func (s *State) Named(name string) *game.Character {
	for _, c := range s.Others {
		if strings.EqualFold(c.Name, name) {
			return c
		}
	}
	return nil
}

// Distance is how far apart two places are across the ground, in feet.
func Distance(a, b [3]float64) float64 { return math.Hypot(a[0]-b[0], a[2]-b[2]) }
