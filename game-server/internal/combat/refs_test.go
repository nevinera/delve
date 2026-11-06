package combat

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"

	"github.com/delve-mmo/delve3d/game-server/internal/schemarefs"
)

// The class editor checks the same class against the same answer (client/src/classes/classFile.test.js).
func TestReferenceProblems(t *testing.T) {
	raw, err := os.ReadFile("testdata/references.class.json")
	if err != nil {
		t.Fatal(err)
	}
	var want []string
	b, _ := os.ReadFile("testdata/references.problems.json")
	if err := json.Unmarshal(b, &want); err != nil {
		t.Fatal(err)
	}
	got, err := ReferenceProblems(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != len(want) {
		t.Fatalf("got %d problems, want %d:\n%q", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("problem %d = %q, want %q", i, got[i], want[i])
		}
	}
	if got, _ := ReferenceProblems([]byte(`{"id":"ok","name":"Fine","statuses":[{"id":"s1"}],"mastery":{"name":"M","status":"s1"}}`)); len(got) != 0 {
		t.Errorf("a class with nothing missing: %q", got)
	}
}

// TestClassRefsAreCurrent fails when the class schema has changed since classrefs.json was written.
func TestClassRefsAreCurrent(t *testing.T) {
	m, err := schemarefs.Compile("../schemarefs/schema", "class.schema.json")
	if err != nil {
		t.Fatal(err)
	}
	want, _ := m.JSON()
	if have, _ := os.ReadFile("classrefs.json"); !bytes.Equal(have, want) {
		t.Error("classrefs.json is out of date: run go generate ./internal/combat")
	}
}
