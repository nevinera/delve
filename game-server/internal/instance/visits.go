package instance

import (
	"context"
	"log/slog"
	"math"
	"strings"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// Visit is somewhere in this zone a character has been, for the in-game
// map (see plans/map-visits.md): the zone itself (no Map), a map in it (no
// Place), or a place on that map.
type Visit struct {
	Map   string `json:"map"`
	Place string `json:"place"`
}

// Key is the visit as a slot's Visited key: "", "map" or "map/place".
func (v Visit) Key() string {
	if v.Place == "" {
		return v.Map
	}
	return v.Map + "/" + v.Place
}

// visitEvent is a player unit arriving somewhere it may not have visited.
type visitEvent struct {
	UnitID uuid.UUID
	Visit  Visit
}

func visitedKeys(visits []Visit) map[string]bool {
	keys := make(map[string]bool, len(visits))
	for _, v := range visits {
		keys[v.Key()] = true
	}
	return keys
}

// placeShape is a place's outline, with its bounds and area for quick
// lookup (placeAt).
type placeShape struct {
	identifier             string
	polygon                []instanceconfig.Location
	minX, minY, maxX, maxY float64
	area                   float64
}

func buildPlaceShapes(zone instanceconfig.Zone) map[string][]placeShape {
	shapes := make(map[string][]placeShape, len(zone.Maps))
	for _, m := range zone.Maps {
		for _, p := range m.Places {
			if len(p.Polygon) < 3 {
				continue
			}
			s := placeShape{identifier: p.Identifier, polygon: p.Polygon,
				minX: math.Inf(1), minY: math.Inf(1), maxX: math.Inf(-1), maxY: math.Inf(-1)}
			for i, a := range p.Polygon {
				b := p.Polygon[(i+1)%len(p.Polygon)]
				s.minX, s.maxX = math.Min(s.minX, a.X), math.Max(s.maxX, a.X)
				s.minY, s.maxY = math.Min(s.minY, a.Y), math.Max(s.maxY, a.Y)
				s.area += a.X*b.Y - b.X*a.Y
			}
			s.area = math.Abs(s.area) / 2
			shapes[m.Identifier] = append(shapes[m.Identifier], s)
		}
	}
	return shapes
}

// placeAt is the place on mapID at (x, y), or "" if it's in none. Where
// places nest, it's the smallest around the point (docs/schema/map.md#place).
// Tick loop only.
func (inst *Instance) placeAt(mapID string, x, y float64) string {
	if inst.placeShapes == nil {
		inst.placeShapes = buildPlaceShapes(inst.ZoneConfig)
	}
	best, bestArea := "", math.Inf(1)
	for _, s := range inst.placeShapes[mapID] {
		if x < s.minX || x > s.maxX || y < s.minY || y > s.maxY || s.area >= bestArea {
			continue
		}
		if pointInPolygon(x, y, s.polygon) {
			best, bestArea = s.identifier, s.area
		}
	}
	return best
}

// pointInPolygon reports whether (x, y) is inside polygon (even-odd rule).
func pointInPolygon(x, y float64, polygon []instanceconfig.Location) bool {
	inside := false
	for i, j := 0, len(polygon)-1; i < len(polygon); j, i = i, i+1 {
		a, b := polygon[i], polygon[j]
		if (a.Y > y) != (b.Y > y) && x < (b.X-a.X)*(y-a.Y)/(b.Y-a.Y)+a.X {
			inside = !inside
		}
	}
	return inside
}

// collectVisits finds this tick's visit events: each player unit arriving
// on a map (spawning included), and in a place. It reports every arrival,
// visited or not; RecordVisits skips the ones already recorded. Tick loop
// only.
func (inst *Instance) collectVisits(state *instancestate.InstanceState) []visitEvent {
	if inst.visitWhere == nil {
		inst.visitWhere = make(map[uuid.UUID]Visit)
	}
	var events []visitEvent
	for id, unit := range state.Units {
		if !strings.HasPrefix(unit.ZoneUnitIdentifier, "player:") {
			continue
		}
		here := Visit{Map: unit.MapIdentifier, Place: inst.placeAt(unit.MapIdentifier, unit.Position.X, unit.Position.Y)}
		before, seen := inst.visitWhere[id]
		if seen && before == here {
			continue
		}
		inst.visitWhere[id] = here
		if !seen || before.Map != here.Map {
			events = append(events, visitEvent{UnitID: id, Visit: Visit{Map: here.Map}})
		}
		if here.Place != "" {
			events = append(events, visitEvent{UnitID: id, Visit: here})
		}
	}
	for id := range inst.visitWhere {
		if _, ok := state.Units[id]; !ok {
			delete(inst.visitWhere, id)
		}
	}
	return events
}

// RecordVisits records each event's visit through Rails, unless the
// player's slot has it already. Calls Rails, so run it in its own
// goroutine.
func (inst *Instance) RecordVisits(ctx context.Context, events []visitEvent) {
	for _, event := range events {
		slot := inst.slotByUnitID(event.UnitID)
		if slot == nil {
			continue
		}
		inst.recordVisit(ctx, slot.ID, event.Visit)
	}
}

// RecordZoneVisit records that the character in slotID has been to this
// zone. Calls Rails, so run it in its own goroutine.
func (inst *Instance) RecordZoneVisit(ctx context.Context, slotID uuid.UUID) {
	inst.recordVisit(ctx, slotID, Visit{})
}

// recordVisit records visit for the character in slotID, logging any
// failure. A no-op for a slot with no world character, or that has the
// visit already.
func (inst *Instance) recordVisit(ctx context.Context, slotID uuid.UUID, visit Visit) {
	inst.visitMu.Lock()
	defer inst.visitMu.Unlock()
	worldCharacterID, visited, err := inst.cachedVisit(slotID, visit)
	if err != nil || visited {
		return
	}
	if inst.RailsClient == nil {
		return
	}
	if err := inst.RailsClient.RecordVisit(worldCharacterID, inst.ZoneIdentifier, visit.Map, visit.Place); err != nil {
		slog.WarnContext(ctx, "failed to record visit", "error", err, "zone", inst.ZoneIdentifier, "map", visit.Map, "place", visit.Place)
		return
	}
	inst.markVisited(slotID, visit)
}

func (inst *Instance) cachedVisit(slotID uuid.UUID, visit Visit) (worldCharacterID string, visited bool, err error) {
	inst.slotsMu.RLock()
	defer inst.slotsMu.RUnlock()
	slot, ok := inst.slots[slotID]
	if !ok {
		return "", false, errSlotGone
	}
	if slot.WorldCharacterDatabaseID == "" {
		return "", false, ErrNoWorldCharacter
	}
	return slot.WorldCharacterDatabaseID, slot.Visited[visit.Key()], nil
}

func (inst *Instance) markVisited(slotID uuid.UUID, visit Visit) {
	inst.slotsMu.Lock()
	defer inst.slotsMu.Unlock()
	slot, ok := inst.slots[slotID]
	if !ok {
		return
	}
	if slot.Visited == nil {
		slot.Visited = make(map[string]bool)
	}
	slot.Visited[visit.Key()] = true
}

