package game

import (
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// Auto-attacks: starting, stopping and swinging.

// attack starts or stops a player's auto-attack, as it asks.
func (l *Layer) attack(p *Player, m incoming) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.players[p.ID()] != p || p.fight.class == nil {
		return
	}
	if m.Target == 0 {
		l.stopAttacking(p)
		return
	}
	d := l.dummy(m.Target, p.state.Continent)
	if d == nil {
		p.send(encode(refused{Type: "refused", Why: "you need an enemy targeted"}))
		return
	}
	if l.untargetable(&d.unit, l.hub.now()) {
		p.send(encode(refused{Type: "refused", Why: "you can't target that"}))
		return
	}
	l.startAttacking(p, m.Target)
}

func (l *Layer) startAttacking(p *Player, target int64) {
	f := &p.fight
	if f.attacking != target {
		f.attacking, f.swingWhy = target, ""
		p.send(encode(attacking{"attacking", target}))
	}
}

func (l *Layer) stopAttacking(p *Player) {
	f := &p.fight
	if f.attacking != 0 {
		f.attacking, f.swingWhy = 0, ""
		p.send(encode(attacking{"attacking", 0}))
	}
}

// swing starts an auto-attack swing if it's time and the target's in reach. A swing waits for a
// cast to end, and for the target to come into reach and in front of you.
func (l *Layer) swing(p *Player, now time.Time) {
	f := &p.fight
	if f.attacking == 0 || f.cast != nil || now.Before(f.swingAt) || !combat.CanSwing(l.controlsOn(&f.unit)) {
		return
	}
	d := l.dummy(f.attacking, p.state.Continent)
	if d == nil || l.untargetable(&d.unit, now) {
		l.stopAttacking(p)
		return
	}
	why := ""
	if distance(p.state.At, d.state.At) > combat.MeleeFt {
		why = "out of range"
	} else if !facing(p.state.At, p.state.Yaw, d.state.At) {
		why = "you're not facing it"
	} else if !l.sees(p.state.Continent, p.state.At, d.state.At) {
		why = cantSee
	}
	if why != "" {
		if why != f.swingWhy {
			p.send(encode(refused{Type: "refused", Why: why}))
		}
		f.swingWhy = why
		return
	}
	f.swingWhy = ""
	sheet := l.statsOf(&f.unit, nil, now)
	f.swingAt = now.Add(seconds(sheet.Hasted(combat.SwingSeconds) * 100 / max(sheet.AttackSpeed, 1)))
	target := d.ID
	// Those watching hear of the swing first, so they can draw it with the statuses it ends.
	l.tell(p, encode(swung{"swung", p.ID(), target}))
	l.breakStatuses(&f.unit, "action", func(s *combat.Status) bool { return s.KeptBy != nil })
	l.after(now.Add(strikeDelay), nil, func(now time.Time) {
		d := l.dummy(target, "")
		if l.players[p.ID()] != p || d == nil {
			return
		}
		h := hit{Type: "hit", From: p.ID(), On: target, Effect: "damage"}
		ctx := combat.HitContext{Schools: []string{"physical"}, Kinds: []string{"auto", "melee", "direct", "main", "single"}}
		l.strike(p, &d.unit, combat.Amount{Weapon: 1}, ctx, &h, now)
		l.showHit(p.ID(), &d.unit, h)
	})
}
