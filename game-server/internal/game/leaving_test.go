package game

import (
	"context"
	"testing"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

func send(t *testing.T, p *Player, raw string) {
	t.Helper()
	if err := p.Handle([]byte(raw)); err != nil {
		t.Fatal(err)
	}
}

// saidLast says whether the last message waiting for p, closed or not, is of this type.
func saidLast(p *Player, kind string) bool {
	last := map[string]any{}
	for {
		select {
		case b := <-p.Send:
			last = map[string]any{}
			_ = jsonInto(b, &last)
		default:
			return last["type"] == kind
		}
	}
}

func TestACharacterLingersAfterItsConnectionEnds(t *testing.T) {
	h := NewHub(fightWorld{}, characters(nil))
	c := clockOf(h)
	p := enter(t, h, 1)
	h.Leave(p)
	*c += 19
	h.Tick()
	if p.layer.players[1] != p || h.playing[1] != p {
		t.Fatal("it left before its linger was over")
	}
	*c += 1.1
	h.Tick()
	if p.layer.players[1] != nil || h.playing[1] != nil {
		t.Fatal("it stayed after its linger")
	}
}

func TestEnteringWhileLingeringTakesOver(t *testing.T) {
	h := NewHub(fightWorld{}, characters(nil))
	clockOf(h)
	p := enter(t, h, 1)
	p.fight.vitals.Health = 40
	h.Leave(p)
	again := enter(t, h, 1)
	if again.layer.players[1] != again || again.fight.vitals.Health != 40 {
		t.Fatalf("took over with health %v", again.fight.vitals.Health)
	}
}

func TestLoggingOff(t *testing.T) {
	h, p, c := fighting(t)
	use(t, p, "zap")
	pass(h, c, 0.5)
	heard(p)
	send(t, p, `{"type":"logOff"}`)
	if got := lastLog(t, p); got != "error: You can't log off in combat." {
		t.Fatal(got)
	}
	pass(h, c, 6)
	heard(p)
	send(t, p, `{"type":"logOff"}`)
	if got := heard(p, "loggingOff"); len(got) != 1 || got[0]["seconds"] != 20.0 {
		t.Fatalf("loggingOff = %v", got)
	}
	use(t, p, "nova")
	if got := heard(p, "logOffStopped"); len(got) != 1 || got[0]["why"] != "you used an ability" {
		t.Fatalf("stopped = %v", got)
	}
	pass(h, c, 6)
	send(t, p, `{"type":"logOff"}`)
	pass(h, c, 20.1)
	if !p.loggedOff || !saidLast(p, "loggedOff") {
		t.Fatal("not logged off")
	}
	if p.layer.players[1] != nil {
		t.Fatal("still in the world after logging off")
	}
}

func TestStateIsKeptForTenMinutes(t *testing.T) {
	people := characters(nil)
	people.class[1] = "frst0001"
	h := NewHub(homewardWorld{}, people)
	c := clockOf(h)
	p := enter(t, h, 1)
	h.Tick()
	use(t, p, "homeward")
	pass(h, c, 10.2)
	p.fight.vitals.Health = 30
	start := h.now()
	key := statusKey{"chill001", 1}
	p.fight.vitals.Statuses[key] = &activeStatus{def: p.fight.class.Status("chill001"), since: start, until: start.Add(60 * time.Second), stacks: 1}
	gone(h, p)

	// Five minutes later: the cooldown has run on, the status has stood still.
	*c += 300
	p = enter(t, h, 1)
	welcome := next(t, p)
	if welcome["you"].(map[string]any)["health"] != 30.0 {
		t.Fatalf("welcome = %v", welcome)
	}
	if got := heard(p, "cooldown"); len(got) != 1 || got[0]["ability"] != "homeward" || got[0]["seconds"].(float64) > 1200-300 {
		t.Fatalf("cooldowns = %v", got)
	}
	if held := p.fight.vitals.Statuses[key]; held == nil || held.until.Sub(h.now()) < 39*time.Second {
		t.Fatalf("status = %+v", held)
	}

	// More than ten minutes after leaving, it starts afresh.
	gone(h, p)
	*c += 601
	p = enter(t, h, 1)
	if p.fight.vitals.Health != p.fight.vitals.MaxHealth || len(p.fight.cooldowns) != 0 {
		t.Fatalf("health %v, cooldowns %v", p.fight.vitals.Health, p.fight.cooldowns)
	}
}

func TestRestingLeavesAtOnce(t *testing.T) {
	h := NewHub(restfulWorld{}, characters(nil))
	c := clockOf(h)
	p := enter(t, h, 1)
	move(t, p, 300, 300)
	heard(p)
	send(t, p, `{"type":"logOff"}`)
	h.Tick()
	if !p.loggedOff || !saidLast(p, "loggedOff") || p.layer.players[1] != nil {
		t.Fatal("logging off in a rest area wasn't at once")
	}
	*c += 1
	if err := h.Flush(context.Background()); err != nil {
		t.Fatal(err)
	}
	p = enter(t, h, 1)
	h.Leave(p)
	if p.layer.players[1] != nil {
		t.Fatal("exiting in a rest area lingered")
	}
}

// restfulWorld is fightWorld with an area around its inn.
type restfulWorld struct{ fightWorld }

func (r restfulWorld) Load(ctx context.Context, repo, sha string) (*worlds.World, error) {
	w, err := r.fightWorld.Load(ctx, repo, sha)
	w.RestPoints[0].Area = [][2]float64{{250, 250}, {350, 250}, {350, 350}, {250, 350}}
	for _, c := range w.Classes {
		c.WithBuiltins()
	}
	return w, err
}

func TestRestingIsAStatus(t *testing.T) {
	people := characters(nil)
	people.class[1] = "frst0001"
	h := NewHub(restfulWorld{}, people)
	clockOf(h)
	p := enter(t, h, 1)
	h.Tick()
	key := statusKey{"resting", 1}
	if p.fight.vitals.Statuses[key] != nil {
		t.Fatal("resting away from a rest area")
	}
	move(t, p, 300, 300)
	heard(p)
	h.Tick()
	if got := heard(p, "statusOn"); len(got) != 1 || got[0]["status"] != "resting" || p.fight.vitals.Statuses[key] == nil {
		t.Fatalf("statusOn = %v", got)
	}
	move(t, p, 100, 100)
	heard(p)
	h.Tick()
	if p.fight.vitals.Statuses[key] != nil {
		t.Fatal("still resting after leaving the area")
	}
}
