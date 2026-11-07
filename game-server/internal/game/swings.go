package game

import (
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// Auto-attacks: starting, stopping and swinging.

// attack starts or stops a player's auto-attack, as it asks.
func (cm *Combat) attack(u *unit, m incoming) {
	cm.state.mu.Lock()
	defer cm.state.mu.Unlock()
	if cm.state.playerOf(u) == nil || u.fight.class == nil {
		return
	}
	if m.Target == 0 {
		cm.stopAttacking(u)
		return
	}
	d := cm.state.dummy(m.Target, u.char.Continent)
	if d == nil {
		u.send(encode(refused{Type: "refused", Why: "you need an enemy targeted"}))
		return
	}
	if cm.untargetable(&d.unit, cm.now()) {
		u.send(encode(refused{Type: "refused", Why: "you can't target that"}))
		return
	}
	cm.startAttacking(u, m.Target)
}

func (cm *Combat) startAttacking(u *unit, target int64) {
	f := u.fight
	if f.attacking != target {
		f.attacking, f.swingWhy = target, ""
		u.send(encode(attacking{"attacking", target}))
	}
}

func (cm *Combat) stopAttacking(u *unit) {
	f := u.fight
	if f.attacking != 0 {
		f.attacking, f.swingWhy = 0, ""
		u.send(encode(attacking{"attacking", 0}))
	}
}

// swing starts an auto-attack swing if it's time and the target's in reach. A swing waits for a
// cast to end, and for the target to come into reach and in front of you.
func (cm *Combat) swing(u *unit, now time.Time) {
	f := u.fight
	if f.attacking == 0 || f.cast != nil || now.Before(f.swingAt) || !combat.CanSwing(cm.controlsOn(&f.unit)) {
		return
	}
	d := cm.state.dummy(f.attacking, u.char.Continent)
	if d == nil || cm.untargetable(&d.unit, now) {
		cm.stopAttacking(u)
		return
	}
	why := ""
	if distance(u.char.At, d.state.At) > combat.MeleeFt {
		why = "out of range"
	} else if !facing(u.char.At, u.char.Yaw, d.state.At) {
		why = "you're not facing it"
	} else if !cm.sees(u.char.Continent, u.char.At, d.state.At) {
		why = cantSee
	}
	if why != "" {
		if why != f.swingWhy {
			u.send(encode(refused{Type: "refused", Why: why}))
		}
		f.swingWhy = why
		return
	}
	f.swingWhy = ""
	sheet := cm.statsOf(&f.unit, nil, now)
	f.swingAt = now.Add(seconds(sheet.Hasted(combat.SwingSeconds) * 100 / max(sheet.AttackSpeed, 1)))
	target := d.ID
	// Those watching hear of the swing first, so they can draw it with the statuses it ends.
	cm.state.tellOf(u.ID, encode(swung{"swung", u.ID, target}))
	cm.breakStatuses(&f.unit, "action", func(s *combat.Status) bool { return s.KeptBy != nil })
	cm.after(now.Add(strikeDelay), nil, func(now time.Time) {
		d := cm.state.dummy(target, "")
		if cm.state.playerOf(u) == nil || d == nil {
			return
		}
		h := hit{Type: "hit", From: u.ID, On: target, Effect: "damage"}
		ctx := combat.HitContext{Schools: []string{"physical"}, Kinds: []string{"auto", "melee", "direct", "main", "single"}}
		cm.strike(u, &d.unit, combat.Amount{Weapon: 1}, ctx, &h, now)
		cm.state.showHit(u.ID, &d.unit, h)
	})
}
