package worlds

import "testing"

func TestRestPointsTakeTheirAreasFromRegions(t *testing.T) {
	w := readWorld(t, map[string]string{
		"world.json": `{"version":2,"continents":[{"key":"main"},{"key":"isle"}],"spawn":{"continent":"main","at":[1,2]},"restPoints":[
			{"id":"inn","continent":"main","at":[5,5],"area":"area0001"},
			{"id":"camp","continent":"main","at":[50,50],"area":"gone0001"},
			{"id":"old","continent":"main","at":[90,90],"area":[[80,80],[100,80],[100,100]]},
			{"id":"hut","continent":"isle","at":[5,5],"area":"area0001"}
		]}`,
		"places/continents/main/regions.json": `{"version":1,"areas":[
			{"id":"area0001","points":[[0,0],[10,0],[10,10],[0,10]]},
			{"id":"area0002","points":[[0,0],[10,0]]}
		]}`,
	})
	if len(w.Areas["main"]) != 1 || w.Area("main", "area0001") == nil || w.Area("main", "area0002") != nil {
		t.Fatalf("areas = %+v", w.Areas)
	}
	if !w.Resting("main", 5, 5) || w.Resting("main", 50, 50) || w.Resting("main", 90, 92) {
		t.Fatal("resting where a rest point's area isn't, or not where it is")
	}
	if w.Resting("isle", 5, 5) {
		t.Fatal("an area id is only good on its own continent")
	}
}
