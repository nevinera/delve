package worlds

import (
	_ "embed"
	"encoding/json"
	"math"
	"strings"
)

// What fills object slots (client/src/v2/fill.js), by fill.json, a copy of client/src/v2/fill.json:
// trees and objects, which stand in the way. Only their trunks and footprints matter here.

//go:embed fill.json
var fillJSON []byte

type fillEntry struct {
	Tree   string  `json:"tree"`
	Size   int     `json:"size"`
	Object string  `json:"object"`
	Share  float64 `json:"share"`
	// A built object says these itself, since its type isn't one of objectTypes: its scales, and
	// its footprint and height at scale 1. BlocksSight is false for one you see through.
	Scales      *[2]float64 `json:"scales"`
	Footprint   *footprint  `json:"footprint"`
	Height      float64     `json:"height"`
	BlocksSight *bool       `json:"blocksSight"`
}

var fillTable = func() (t struct {
	Biomes map[string]map[string][]fillEntry `json:"biomes"`
	Banks  map[string]map[string][]fillEntry `json:"banks"`
}) {
	if err := json.Unmarshal(fillJSON, &t); err != nil {
		panic(err)
	}
	return t
}()

// The client's names: biomes (client/src/v2/biomes.js) and water types (client/src/v2/water.js).
var (
	biomeNames = []string{
		"plains", "forest", "rocky", "swamp",
		"autumn forest", "giant woods", "taiga", "blossom valley", "bamboo grove", "snowy forest", "highlands",
		"savanna", "red canyon", "sand desert", "salt flats",
		"jungle", "primeval valley", "tropical coast", "sandy beach",
		"snowfield", "frozen tundra", "glacier",
		"mangrove", "fungal marsh",
		"haunted woods", "plague lands", "volcanic waste", "corrupted waste", "enchanted glade", "crystal forest",
	}
	waterTypes = []string{"sea", "lake", "pond", "swamp", "river", "stream"}
)

const seaType = 0

// running is whether a water type runs: a course's.
func running(kind uint8) bool {
	return int(kind) < len(waterTypes) && (waterTypes[kind] == "stream" || waterTypes[kind] == "river")
}

// footprint is an object's blocking shape on the ground, in feet (client/src/world/objects.js): a
// circle's radius, a capsule's radius and half length along the object's own x, or a rect's width
// (along its x) and depth. Open footprints don't block.
type footprint struct {
	Circle  float64   `json:"circle,omitempty"`
	Capsule []float64 `json:"capsule,omitempty"`
	Rect    []float64 `json:"rect,omitempty"`
	Open    float64   `json:"open,omitempty"`
}

func (f footprint) scaled(s float64) footprint {
	out := footprint{Circle: f.Circle * s, Open: f.Open}
	for _, v := range f.Capsule {
		out.Capsule = append(out.Capsule, v*s)
	}
	for _, v := range f.Rect {
		out.Rect = append(out.Rect, v*s)
	}
	return out
}

// reach is how far the footprint reaches from the object's middle.
func (f footprint) reach() float64 {
	switch {
	case f.Open > 0:
		return f.Open
	case f.Circle > 0:
		return f.Circle
	case len(f.Capsule) == 2:
		return f.Capsule[0] + f.Capsule[1]
	case len(f.Rect) == 2:
		return math.Hypot(f.Rect[0], f.Rect[1]) / 2
	}
	return 0
}

// objectType is a built-in kind of object: its size range in feet, and its footprint and height
// at scale 1.
type objectType struct {
	size      [2]float64
	footprint footprint
	height    float64
}

// objectTypes are client/src/world/objects.js's OBJECT_TYPES.
var objectTypes = map[string]objectType{
	"boulder":      {[2]float64{3, 8}, footprint{Circle: 0.45}, 0.8},
	"outcrop":      {[2]float64{2.5, 4}, footprint{Rect: []float64{2.6, 1.6}}, 1},
	"bush":         {[2]float64{3, 5}, footprint{Circle: 0.42}, 0.95},
	"fence":        {[2]float64{3.5, 4.5}, footprint{Rect: []float64{2.6, 0.2}}, 1},
	"log":          {[2]float64{25, 50}, footprint{Capsule: []float64{0.1, 0.5}}, 0.2},
	"stump":        {[2]float64{3, 6}, footprint{Circle: 0.8}, 1},
	"mossyBoulder": {[2]float64{3, 6}, footprint{Circle: 0.45}, 0.85},
	"thicket":      {[2]float64{4, 6}, footprint{Circle: 0.7}, 0.95},
	"uprooted":     {[2]float64{60, 110}, footprint{Capsule: []float64{0.045, 0.5}}, 0.24},
	"rock":         {[2]float64{4, 15}, footprint{Circle: 0.45}, 0.8},
	"spire":        {[2]float64{10, 25}, footprint{Circle: 0.15}, 1},
	"rubble":       {[2]float64{4, 8}, footprint{Circle: 0.5}, 0.35},
	"deadStump":    {[2]float64{3, 6}, footprint{Circle: 0.8}, 1},
	"rottingLog":   {[2]float64{20, 45}, footprint{Capsule: []float64{0.1, 0.5}}, 0.2},
	"hollowStump":  {[2]float64{4, 7}, footprint{Circle: 0.8}, 1},
	"rootTangle":   {[2]float64{4, 7}, footprint{Circle: 0.55}, 0.7},
	"hummock":      {[2]float64{2, 3.5}, footprint{Circle: 1.1}, 1},
	"driftLog":     {[2]float64{15, 35}, footprint{Capsule: []float64{0.07, 0.5}}, 0.14},
}

// Trees' trunks and heights by size and kind (client/src/render/treeMeshes.js).
var (
	treeSizes = map[int]struct{ height, trunk, crown float64 }{1: {60, 2.5, 18}, 2: {90, 4, 28}, 3: {120, 6, 38}}
	treeKinds = map[string]struct{ height, trunk float64 }{
		"oak": {1, 1}, "pine": {1.15, 0.8}, "willow": {0.9, 1.2}, "dead": {0.85, 0.8},
		"autumn": {1, 1}, "giant": {1.35, 2}, "spruce": {1.2, 0.8}, "snowpine": {1.15, 0.8}, "blossom": {0.8, 0.9},
		"bamboo": {0.7, 0.5}, "acacia": {0.8, 0.7}, "palm": {1, 0.45}, "treefern": {0.55, 0.6}, "jungle": {1.2, 1.1},
		"mangrove": {0.6, 0.7}, "giantcap": {0.55, 1.3}, "gnarled": {0.8, 1}, "blighted": {0.8, 0.9}, "charred": {0.7, 0.8},
		"thorn": {0.75, 0.9}, "silverleaf": {1.05, 0.85}, "crystal": {0.6, 1},
	}
)

func treeKind(kind string) struct{ height, trunk float64 } {
	if k, ok := treeKinds[kind]; ok {
		return k
	}
	return treeKinds["oak"]
}

// thing is a tree or object standing in the way: its footprint, turned by yaw, at (x, z), from y
// up `height` feet.
type thing struct {
	Type      string    `json:"type"`
	X, Z      float64   `json:"-"`
	Yaw       float64   `json:"yaw"`
	Footprint footprint `json:"footprint"`
	Height    float64   `json:"height"`
	Y         float64   `json:"-"`
	tree      bool
	slotted   bool // in a tile's slots rather than placed by hand
	crown     crown
}

// crown is a tree's crown as line of sight has it: an egg, `from` to `to` over its ground, `radius`
// round at its widest.
type crown struct{ from, to, radius float64 }

// Crowns' shapes by kind, as shares of the tree's height and its size's crown (treeMeshes.js
// CROWNS). Dead trees have none.
var treeCrowns = map[string]crown{"oak": {0.576, 1.216, 1}, "pine": {0.288, 1.108, 0.45}, "willow": {0.48, 0.98, 1.3},
	"autumn": {0.576, 1.216, 1}, "giant": {0.672, 1.232, 1.25}, "spruce": {0.192, 1.092, 0.4}, "snowpine": {0.192, 1.072, 0.45},
	"blossom": {0.48, 1.04, 1.05}, "bamboo": {0.3, 1.02, 0.36}, "acacia": {0.76, 0.96, 1.25},
	"jungle": {0.58, 1.02, 1.15}, "mangrove": {0.36, 0.88, 1.1}, "giantcap": {0.6, 1, 0.9},
	"gnarled": {0.5, 0.94, 0.7}, "blighted": {0.5, 0.94, 0.7}, "silverleaf": {0.42, 1.02, 0.95},
}

// crownReachFt is the widest crown of all.
const crownReachFt = 50.0

// crownOf is the crown of a tree of a kind and size. Unknown kinds are oaks.
func crownOf(kind string, height, across float64) crown {
	c, ok := treeCrowns[kind]
	if !ok {
		if _, known := treeKinds[kind]; known {
			return crown{}
		}
		c = treeCrowns["oak"]
	}
	return crown{c.from * height, c.to * height, c.radius * across}
}

// seeThrough are the built-in kinds you can see through (client/src/world/objects.js blocksSight).
var seeThrough = map[string]bool{"bush": true, "fence": true, "thicket": true, "rootTangle": true}

// The ground's class for filling slots (client/src/v2/look.js groundClass).
const (
	steepDeg    = 50.0
	slopeDeg    = 22.0
	shoreFt     = 3.0
	shallowFt   = 1.5
	bucketFt    = 32.0
	slopeFt     = 2.0  // how far either way the ground's slope is taken under a slot
	nearShoreFt = 16.0 // how far from water a slot can be on the shore
)

var treeRoom = []float64{0, 8, 12, 17}

// nearWater is the water at or near a slot, as client/src/create/scatter.js finds it.
type nearWater struct {
	wet     bool
	level   float64
	running bool
}

func groundClass(slope, height float64, water *nearWater) string {
	switch {
	case water != nil && water.wet:
		return "bed"
	case slope >= steepDeg:
		return "steep"
	case water != nil && height < water.level+shoreFt:
		if water.running {
			return "bank"
		}
		return "shore"
	case slope >= slopeDeg:
		return "slope"
	}
	return "flat"
}

func pickFrom(entries []fillEntry, roll int, fine float64) *fillEntry {
	past := (float64(roll) + fine) / 256
	for i := range entries {
		if past < entries[i].Share {
			return &entries[i]
		}
		past -= entries[i].Share
	}
	return nil
}

// fillSlots is what stands in tile (tx, tz)'s slots (client/src/v2/fill.js fillSlots): biomeAt(i,
// j) gives the biome of its cell (i, j), and groundAt(x, z) the ground's height, slope (degrees)
// and water there.
func fillSlots(slots []byte, tx, tz int, biomeAt func(i, j int) uint8, groundAt func(x, z float64) (float64, float64, *nearWater)) []thing {
	var out []thing
	room := map[[2]int][][3]float64{}
	bucket := func(x, z float64) [2]int {
		return [2]int{int(math.Floor(x / bucketFt)), int(math.Floor(z / bucketFt))}
	}
	crowded := func(x, z, r float64) bool {
		b := bucket(x, z)
		for j := b[1] - 1; j <= b[1]+1; j++ {
			for i := b[0] - 1; i <= b[0]+1; i++ {
				for _, p := range room[[2]int{i, j}] {
					if math.Hypot(p[0]-x, p[1]-z) < p[2]+r {
						return true
					}
				}
			}
		}
		return false
	}
	keep := func(x, z, r float64) {
		b := bucket(x, z)
		room[b] = append(room[b], [3]float64{x, z, r})
	}
	for at := 0; at+slotBytes <= len(slots); at += slotBytes {
		sx, sz, size, roll := int(slots[at]), int(slots[at+1]), int(slots[at+2]), int(slots[at+3])
		if size >= len(slotSizes) {
			continue
		}
		x, z := float64(tx)*TileFt+float64(sx)+0.5, float64(tz)*TileFt+float64(sz)+0.5
		fx, fz := int(math.Floor(x)), int(math.Floor(z))
		fine := hash2(fx, fz, slotSeed+32)
		height, slope, water := groundAt(x, z)
		class := groundClass(slope, height, water)
		if class == "steep" || (class == "bed" && water.level-height > shallowFt) {
			continue
		}
		var entry *fillEntry
		if class == "bank" || class == "shore" || class == "bed" {
			by := "still"
			if water.running {
				by = "running"
			}
			entry = pickFrom(fillTable.Banks[by][slotSizes[size]], roll, fine)
		} else {
			entry = pickFrom(fillTable.Biomes[biomeName(biomeAt(sx>>2, sz>>2))][slotSizes[size]], roll, fine)
		}
		if entry == nil {
			continue
		}
		pick := func(n int) float64 { return hash2(fx, fz, slotSeed+16+n) }
		if entry.Tree != "" {
			r := treeRoom[entry.Size]
			if crowded(x, z, r) {
				continue
			}
			keep(x, z, r)
			s, k := treeSizes[entry.Size], treeKind(entry.Tree)
			out = append(out, thing{Type: entry.Tree, X: x, Z: z, Footprint: footprint{Circle: s.trunk * k.trunk}, Height: s.height * k.height, tree: true, crown: crownOf(entry.Tree, s.height*k.height, s.crown)})
			continue
		}
		spec, ok := objectTypes[entry.Object]
		if entry.Footprint != nil && entry.Scales != nil {
			spec, ok = objectType{*entry.Scales, *entry.Footprint, entry.Height}, true
		}
		if !ok {
			continue
		}
		scale := spec.size[0] + (spec.size[1]-spec.size[0])*pick(0)
		o := thing{Type: entry.Object, X: x, Z: z, Yaw: pick(1) * math.Pi * 2, Footprint: spec.footprint.scaled(scale), Height: spec.height * scale}
		r := o.Footprint.reach()
		if crowded(x, z, r) {
			continue
		}
		keep(x, z, r)
		out = append(out, o)
	}
	return out
}

// fillThrough is the built objects in fill.json you see through, by id. They're built into the
// client, so a world's files don't say.
var fillThrough = func() map[string]bool {
	out := map[string]bool{}
	for _, sizes := range fillTable.Biomes {
		for _, entries := range sizes {
			for _, e := range entries {
				if id, built := strings.CutPrefix(e.Object, "built:"); built && e.BlocksSight != nil && !*e.BlocksSight {
					out[id] = true
				}
			}
		}
	}
	return out
}()

func biomeName(b uint8) string {
	if int(b) < len(biomeNames) {
		return biomeNames[b]
	}
	return ""
}

// slopeOf is the ground's slope in degrees from four heights `width` ft apart (look.js slopeOf).
func slopeOf(nw, ne, sw, se, width float64) float64 {
	dx := (ne - nw + se - sw) / 2
	dz := (sw - nw + se - ne) / 2
	return math.Atan(math.Hypot(dx, dz)/width) * 180 / math.Pi
}
