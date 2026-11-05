package game

import (
	"maps"
	"time"
)

const (
	logOffWait = 20 * time.Second // how long logging off takes, out of combat and standing still
	lingerFor  = 20 * time.Second // how long a character stays in the world after its connection ends
	keepFor    = 10 * time.Minute // how long the server keeps a character's state after it leaves
)

type keepKey struct{ world, character int64 }

// kept is what the server keeps of a character that's left, to give back if it comes back soon:
// its health, resources and cooldowns, and the statuses it put on itself. Statuses stand still
// while it's gone; cooldowns and lockouts carry on running.
type kept struct {
	at        time.Time
	sha       string
	class     string
	level     int
	health    float64
	resources map[string]float64
	cooldowns map[string][]time.Time
	lockouts  map[string]time.Time
	since     map[string]time.Time
	statuses  map[statusKey]*activeStatus
}

// keep is what to keep of a player as it leaves. The layer's lock is held.
func (l *Layer) keep(p *Player, now time.Time) *kept {
	f := &p.fight
	k := &kept{at: now, sha: l.world.Sha, level: f.level, health: f.vitals.Health, resources: maps.Clone(f.resources), cooldowns: map[string][]time.Time{}, lockouts: maps.Clone(f.lockouts), since: maps.Clone(f.since), statuses: map[statusKey]*activeStatus{}}
	if f.class != nil {
		k.class = f.class.ID
	}
	for id, spent := range f.cooldowns {
		if left := live(spent, now); len(left) > 0 {
			k.cooldowns[id] = left
		}
	}
	// What a class gives for good comes back with it, what others put on goes when they do, and
	// what an area keeps on goes with the area.
	for key, held := range f.vitals.Statuses {
		if held.granted || key.from != p.ID() || held.zone != nil || len(held.zones) > 0 {
			continue
		}
		copied := *held
		copied.ticks, copied.fired, copied.counts = maps.Clone(held.ticks), maps.Clone(held.fired), maps.Clone(held.counts)
		k.statuses[key] = &copied
	}
	return k
}

// restore gives a character entering again what was kept of it, if it's the same class and level
// in the same release of the world. Its statuses pick up where they stood when it left.
func (p *Player) restore(k *kept, sha string, now time.Time) {
	f := &p.fight
	class := ""
	if f.class != nil {
		class = f.class.ID
	}
	if k == nil || class != k.class || f.level != k.level || sha != k.sha {
		return
	}
	away := now.Sub(k.at)
	f.vitals.Health = min(k.health, f.vitals.MaxHealth)
	p.state.Health = f.vitals.Health
	for key, v := range k.resources {
		if _, ok := f.resources[key]; ok {
			f.resources[key] = v
		}
	}
	f.cooldowns, f.lockouts, f.since = k.cooldowns, k.lockouts, k.since
	for key, held := range k.statuses {
		held.since = held.since.Add(away)
		if !held.until.IsZero() {
			held.until = held.until.Add(away)
		}
		for i := range held.ticks {
			held.ticks[i] = held.ticks[i].Add(away)
		}
		for i := range held.fired {
			held.fired[i] = held.fired[i].Add(away)
		}
		f.vitals.Statuses[key] = held
	}
	f.resChanged = true
}

// takeKept is what's kept of a character, if it left less than keepFor ago, and forgets it.
func (h *Hub) takeKept(world, character int64, now time.Time) *kept {
	h.mu.Lock()
	defer h.mu.Unlock()
	key := keepKey{world, character}
	k := h.kept[key]
	delete(h.kept, key)
	if k == nil || now.Sub(k.at) > keepFor {
		return nil
	}
	return k
}

// Leave is a player's connection ending. Logged off, it leaves the world now; otherwise it stays
// there, standing still, for lingerFor, where it can still be hit.
func (h *Hub) Leave(p *Player) {
	p.Drop("")
	l := p.layer
	l.mu.Lock()
	if l.players[p.ID()] == p && !p.loggedOff && p.lingerUntil.IsZero() {
		p.lingerUntil = h.now().Add(lingerFor)
		p.logOffAt = time.Time{}
		l.stopCast(p)
		l.stopAttacking(p)
		p.state.Move = Move{Gait: "run"}
		update := encode(moved{"moved", p.ID(), p.state.At, p.state.Yaw, p.state.Move})
		for _, o := range l.near(p) {
			o.send(update)
		}
		l.mu.Unlock()
		return
	}
	l.mu.Unlock()
	h.remove(p, true)
}

// remove takes a player out of the world, keeping its state for keepFor if `keep` says to.
func (h *Hub) remove(p *Player, keep bool) {
	h.mu.Lock()
	if h.playing[p.ID()] == p {
		delete(h.playing, p.ID())
	}
	h.mu.Unlock()
	k := p.layer.leave(p)
	if !keep || k == nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for key, old := range h.kept {
		if k.at.Sub(old.at) > keepFor {
			delete(h.kept, key)
		}
	}
	h.kept[keepKey{p.layer.worldID, p.ID()}] = k
}

// logOff starts a player logging off, which takes logOffWait out of combat.
func (l *Layer) logOff(p *Player) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.players[p.ID()] != p {
		return
	}
	now := l.hub.now()
	if p.fight.inCombat(now) {
		answer(p, "error", "You can't log off in combat.")
		return
	}
	if !p.logOffAt.IsZero() {
		return
	}
	p.logOffAt = now.Add(logOffWait)
	p.send(encode(loggingOff{"loggingOff", logOffWait.Seconds()}))
}

// stopLoggingOff calls off a player's logging off, saying why. The layer's lock is held.
func (l *Layer) stopLoggingOff(p *Player, why string) {
	if p.logOffAt.IsZero() {
		return
	}
	p.logOffAt = time.Time{}
	p.send(encode(logOffStopped{"logOffStopped", why}))
}

// leavings logs off those whose wait is up, and gives back those whose linger is over, to take
// out of the world. The layer's lock is held.
func (l *Layer) leavings(now time.Time) []*Player {
	var out []*Player
	for _, p := range l.players {
		if !p.logOffAt.IsZero() {
			if p.fight.inCombat(now) {
				l.stopLoggingOff(p, "you're in combat")
			} else if !now.Before(p.logOffAt) {
				p.loggedOff = true
				p.send(encode(loggedOff{"loggedOff"}))
				p.Drop("")
				out = append(out, p)
			}
		}
		if !p.lingerUntil.IsZero() && !now.Before(p.lingerUntil) {
			out = append(out, p)
		}
	}
	return out
}
