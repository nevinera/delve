package combat

import (
	"encoding/json"
	"maps"
	"os"
	"slices"
	"testing"
)

func TestBuilds(t *testing.T) {
	text, err := os.ReadFile("testdata/build.json")
	if err != nil {
		t.Fatal(err)
	}
	var data struct {
		Class Class
		Cases []struct {
			Name  string
			Level int
			Build Build
			Want  Build
			Known []string
			Held  []string
		}
	}
	if err := json.Unmarshal(text, &data); err != nil {
		t.Fatal(err)
	}
	for _, c := range data.Cases {
		t.Run(c.Name, func(t *testing.T) {
			got := data.Class.Allowed(c.Build, c.Level)
			if got.Specialization != c.Want.Specialization || !maps.Equal(got.Talents, c.Want.Talents) {
				t.Fatalf("build = %+v, want %+v", got, c.Want)
			}
			var known []string
			for i := range data.Class.Abilities {
				if a := &data.Class.Abilities[i]; data.Class.Knows(a, c.Level, got) {
					known = append(known, a.ID)
				}
			}
			slices.Sort(known)
			slices.Sort(c.Known)
			if !slices.Equal(known, c.Known) {
				t.Fatalf("known = %v, want %v", known, c.Known)
			}
			held := data.Class.HeldFrom(c.Level, got)
			slices.Sort(held)
			slices.Sort(c.Held)
			if !slices.Equal(held, c.Held) {
				t.Fatalf("held = %v, want %v", held, c.Held)
			}
		})
	}
}
