package combat

import (
	"encoding/json"
	"os"
	"testing"
)

func TestControls(t *testing.T) {
	text, err := os.ReadFile("testdata/controls.json")
	if err != nil {
		t.Fatal(err)
	}
	var data struct {
		Abilities map[string]Ability
		Cases     []struct {
			Controls []string
			Swing    bool
			Still    bool
			Blocked  map[string]string
		}
	}
	if err := json.Unmarshal(text, &data); err != nil {
		t.Fatal(err)
	}
	for _, c := range data.Cases {
		if got := CanSwing(c.Controls); got != c.Swing {
			t.Errorf("%v: can swing = %v", c.Controls, got)
		}
		if got := HoldsStill(c.Controls); got != c.Still {
			t.Errorf("%v: holds still = %v", c.Controls, got)
		}
		for id, a := range data.Abilities {
			if got := Blocked(c.Controls, &a); got != c.Blocked[id] {
				t.Errorf("%v on %s: %q, want %q", c.Controls, id, got, c.Blocked[id])
			}
		}
	}
}

func TestBreaksOnDamage(t *testing.T) {
	for control, want := range map[string]bool{"incapacitate": true, "disorient": true, "fear": true, "stun": false, "root": false} {
		s := Status{Effects: []StatusEffect{{Type: "control", Control: control}}}
		if got := s.BreaksOnDamage(); got != want {
			t.Errorf("%s: %v", control, got)
		}
	}
	if s := (Status{BreaksOn: []string{"damage"}}); !s.BreaksOnDamage() {
		t.Error("a status that says so")
	}
}
