package game

import "iter"

// unit is the unit with that id on `continent`, or on any continent with "", or nil: a training
// dummy, or a player on the layer.
func (l *Layer) unit(id int64, continent string) *unit {
	if d := l.dummy(id, continent); d != nil {
		return &d.unit
	}
	if o := l.players[id]; o != nil && (continent == "" || o.state.Continent == continent) {
		return &o.fight.unit
	}
	return nil
}

// units goes over every unit on the layer, the dummies first.
func (l *Layer) units() iter.Seq[*unit] {
	return func(yield func(*unit) bool) {
		for _, d := range l.dummies {
			if !yield(&d.unit) {
				return
			}
		}
		for _, o := range l.players {
			if !yield(&o.fight.unit) {
				return
			}
		}
	}
}

// playerOf is the player a unit is, while it's on the layer, or nil.
func (l *Layer) playerOf(u *unit) *Player {
	if u == nil || u.player == nil || l.players[u.ID] != u.player {
		return nil
	}
	return u.player
}
