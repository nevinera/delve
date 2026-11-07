package worlds

import (
	"archive/zip"
	"log"
)

// Area is a polygon on a continent that other things point at by its id: [x, z] corners in
// continent feet. Areas can overlap.
type Area struct {
	ID     string       `json:"id"`
	Points [][2]float64 `json:"points"`
}

// Area is the area with that id on a continent, or nil.
func (w *World) Area(continent, id string) *Area {
	for i, a := range w.Areas[continent] {
		if a.ID == id {
			return &w.Areas[continent][i]
		}
	}
	return nil
}

// readAreas reads each continent's places/continents/<c>/regions.json, leaving out areas of fewer
// than three corners. A continent without one has no areas.
func readAreas(files map[string]*zip.File, continents []string) map[string][]Area {
	out := map[string][]Area{}
	for _, continent := range continents {
		path := "places/continents/" + continent + "/regions.json"
		if files[path] == nil {
			continue
		}
		var regions struct {
			Areas []Area `json:"areas"`
		}
		if err := readJSON(files, path, &regions); err != nil {
			log.Printf("worlds: skipping %s: %v", path, err)
			continue
		}
		for _, a := range regions.Areas {
			if a.ID == "" || len(a.Points) < 3 {
				log.Printf("worlds: %s: skipping an area without an id or three corners", path)
				continue
			}
			out[continent] = append(out[continent], a)
		}
	}
	return out
}
