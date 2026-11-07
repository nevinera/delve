package worlds

import (
	"os"
	"path/filepath"
	"testing"
)

// readWorld reads a world from these files, each under a top directory as GitHub's zips have.
func readWorld(t *testing.T, files map[string]string) *World {
	t.Helper()
	path := filepath.Join(t.TempDir(), "w.zip")
	if err := os.WriteFile(path, worldZip(t, files), 0o644); err != nil {
		t.Fatal(err)
	}
	w, err := Read(path)
	if err != nil {
		t.Fatal(err)
	}
	return w
}

const twoContinents = `{"version":2,"continents":[{"key":"main"},{"key":"isle"}],"spawn":{"continent":"main","at":[1,2]}}`

func TestReadCreaturesSkipsOnesItCantRead(t *testing.T) {
	w := readWorld(t, map[string]string{
		"world.json": twoContinents,
		"creatures/gobl0001.json": `{"id":"gobl0001","name":"Goblin","look":{"body":"goblin"},"reaction":"hostile",
			"classification":"normal","health":0.8,"aggroRadius":40,"attack":{"speed":1.8,"range":"melee"},"speed":1.1}`,
		"creatures/wolf0001.json": `{"id":"wolf0001","name":"Wolf","look":{"body":"wolf"},"attack":{"range":12}}`,
		"creatures/bad00001.json": `{"id":"bad00001","attack":{"speed":"fast"}}`,
		"creatures/none.json":     `{"name":"No id"}`,
		"creatures/notes.txt":     `not a creature`,
	})
	if len(w.Creatures) != 2 || w.Creatures[0].ID != "gobl0001" || w.Creatures[1].ID != "wolf0001" {
		t.Fatalf("creatures = %+v", w.Creatures)
	}
	g := w.Creature("gobl0001")
	if g.Name != "Goblin" || g.Reaction != "hostile" || g.Health != 0.8 || g.AggroRadius != 40 || g.Attack.Speed != 1.8 || !g.Attack.Range.Melee || g.Speed != 1.1 || string(g.Look) != `{"body":"goblin"}` {
		t.Fatalf("goblin = %+v", g)
	}
	if r := w.Creature("wolf0001").Attack.Range; r.Melee || r.Feet != 12 {
		t.Fatalf("wolf's range = %+v", r)
	}
	if w.Creature("bad00001") != nil || w.Creature("nope") != nil {
		t.Fatal("found a creature there isn't")
	}
}

func TestReadPlacedMobs(t *testing.T) {
	w := readWorld(t, map[string]string{
		"world.json":              twoContinents,
		"creatures/gobl0001.json": `{"id":"gobl0001","name":"Goblin","look":{"body":"goblin"}}`,
		"places/continents/main/spawns.json": `{"version":1,"regions":[],"placed":[
			{"id":"p1","creature":"gobl0001","at":[10,2,20],"yaw":90,"levels":3,"respawn":300},
			{"id":"p2","creature":"gobl0001","at":[30,0,40],"levels":[5,2],"wander":0},
			{"id":"p3","npc":"vend0001","at":[0,0,0]},
			{"id":"p4","creature":"gone0001","at":[0,0,0],"levels":1},
			{"id":"p6","creature":"gobl0001","at":[0,0,0],"levels":"lots"}
		]}`,
		"places/continents/isle/spawns.json": `{"version":1,"placed":[{"id":"p5","creature":"gobl0001","at":[1,0,1]}]}`,
	})
	if len(w.Placed) != 3 {
		t.Fatalf("placed = %+v", w.Placed)
	}
	one, two, isle := w.Placed[0], w.Placed[1], w.Placed[2]
	if one.ID != "p1" || one.Continent != "main" || one.At != [3]float64{10, 2, 20} || one.Yaw != 90 || one.Levels != (Levels{3, 3}) || one.Respawn != 300 || one.Wander != nil {
		t.Fatalf("first = %+v", one)
	}
	if two.Levels != (Levels{2, 5}) || two.Wander == nil || *two.Wander != 0 {
		t.Fatalf("second = %+v", two)
	}
	if isle.Continent != "isle" || isle.Levels != (Levels{1, 1}) {
		t.Fatalf("on the isle, with no levels = %+v", isle)
	}
}

func TestAWorldWithNoMobsOrBadSpawnsStillLoads(t *testing.T) {
	w := readWorld(t, map[string]string{
		"world.json":                         twoContinents,
		"places/continents/main/spawns.json": `{"placed": "lots"}`,
	})
	if len(w.Creatures) != 0 || len(w.Placed) != 0 {
		t.Fatalf("creatures %+v, placed %+v", w.Creatures, w.Placed)
	}
}

func TestLevels(t *testing.T) {
	for _, bad := range []string{`"three"`, `[1]`, `[1,2,3]`} {
		var l Levels
		if err := l.UnmarshalJSON([]byte(bad)); err == nil {
			t.Errorf("%s read as %v", bad, l)
		}
	}
}
