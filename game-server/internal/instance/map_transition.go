package instance

import (
	"math"
	"math/rand"
	"strings"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

const connectionTriggerDist = 1.5 // feet — how close a unit must be to a line connection to trigger it

// applyMapTransitions checks every non-dead unit against the connections on
// their current map and teleports them through any ZoneLink they are touching.
// Called after applyMovement, before resolveCollisions.
func applyMapTransitions(state *instancestate.InstanceState, zone instanceconfig.Zone) {
	linkIndex := buildLinkIndex(zone)
	connsByMap := buildConnectionsByMap(zone)

	for _, unit := range state.Units {
		if unit.Status == instancestate.UnitStatusDead {
			continue
		}
		conns := connsByMap[unit.MapIdentifier]
		for _, conn := range conns {
			if !touchingConnection(unit, conn) {
				continue
			}
			key := unit.MapIdentifier + "/" + conn.Identifier
			dest, ok := linkIndex[key]
			if !ok {
				continue
			}
			destConn := findConnection(zone, dest.Map, dest.Connection)
			if destConn == nil {
				continue
			}
			traverseConnection(unit, dest.Map, *destConn, state)
			break // one transition per tick per unit
		}
	}
}

// traverseConnection moves unit to the destination map and connection.
// Drops aggro on the unit and on any unit that was targeting it.
func traverseConnection(unit *instancestate.UnitState, destMap string, destConn instanceconfig.MapConnection, state *instancestate.InstanceState) {
	unit.MapIdentifier = destMap
	unit.Position = spawnPosition(destConn)

	// Drop the unit's own aggro.
	if !strings.HasPrefix(unit.ZoneUnitIdentifier, "player:") {
		unit.Target = nil
		unit.Status = instancestate.UnitStatusIdle
		unit.Behavior.MovementPhase = ""
	}

	// Drop aggro from any NPC that was targeting this unit.
	for _, other := range state.Units {
		if strings.HasPrefix(other.ZoneUnitIdentifier, "player:") {
			continue
		}
		if other.Target != nil {
			for id, u := range state.Units {
				if u == unit {
					tid := id
					if *other.Target == tid {
						other.Target = nil
						other.Status = instancestate.UnitStatusIdle
						other.Behavior.MovementPhase = ""
					}
					break
				}
			}
		}
	}
}

// spawnPosition returns the position a unit should appear at when arriving
// through destConn. For line connections it uses the midpoint; for point
// connections it applies a random fuzz within FuzzRadius and FuzzAngle.
func spawnPosition(conn instanceconfig.MapConnection) instanceconfig.Position {
	switch conn.Type {
	case "line":
		mx := (conn.Start.X + conn.End.X) / 2
		my := (conn.Start.Y + conn.End.Y) / 2
		// Face inward: perpendicular to the line, into the map (positive Y for y=0 lines).
		dx := conn.End.X - conn.Start.X
		dy := conn.End.Y - conn.Start.Y
		angle := math.Atan2(-dx, dy) * 180 / math.Pi
		return instanceconfig.Position{X: mx, Y: my, Angle: angle}
	case "point":
		if conn.Position == nil {
			return instanceconfig.Position{}
		}
		r := rand.Float64() * conn.FuzzRadius
		a := (rand.Float64()*conn.FuzzAngle - conn.FuzzAngle/2) * math.Pi / 180
		facing := conn.Position.Angle
		return instanceconfig.Position{
			X:     conn.Position.X + r*math.Sin(a),
			Y:     conn.Position.Y + r*math.Cos(a),
			Angle: facing,
		}
	default:
		if conn.Position != nil {
			return *conn.Position
		}
		return instanceconfig.Position{}
	}
}

// touchingConnection reports whether unit is close enough to conn to trigger it.
func touchingConnection(unit *instancestate.UnitState, conn instanceconfig.MapConnection) bool {
	switch conn.Type {
	case "line":
		if conn.Start == nil || conn.End == nil {
			return false
		}
		return distToSegment(unit.Position.X, unit.Position.Y,
			conn.Start.X, conn.Start.Y,
			conn.End.X, conn.End.Y) <= connectionTriggerDist
	case "point":
		if conn.Position == nil {
			return false
		}
		dx := unit.Position.X - conn.Position.X
		dy := unit.Position.Y - conn.Position.Y
		return math.Sqrt(dx*dx+dy*dy) <= conn.FuzzRadius
	}
	return false
}

// distToSegment returns the minimum distance from point (px,py) to segment (ax,ay)-(bx,by).
func distToSegment(px, py, ax, ay, bx, by float64) float64 {
	dx, dy := bx-ax, by-ay
	lenSq := dx*dx + dy*dy
	if lenSq == 0 {
		dx2, dy2 := px-ax, py-ay
		return math.Sqrt(dx2*dx2 + dy2*dy2)
	}
	t := math.Max(0, math.Min(1, ((px-ax)*dx+(py-ay)*dy)/lenSq))
	cx, cy := ax+t*dx, ay+t*dy
	ex, ey := px-cx, py-cy
	return math.Sqrt(ex*ex + ey*ey)
}

// buildLinkIndex builds a map from "mapId/connectionId" to the destination
// ConnectionIdentifier, respecting the oneWay flag.
func buildLinkIndex(zone instanceconfig.Zone) map[string]instanceconfig.ConnectionIdentifier {
	index := make(map[string]instanceconfig.ConnectionIdentifier)
	for _, link := range zone.ZoneLinks {
		if link.RequiredKey != nil {
			continue // keys not yet implemented
		}
		keyA := link.ConnectionA.Map + "/" + link.ConnectionA.Connection
		keyB := link.ConnectionB.Map + "/" + link.ConnectionB.Connection
		index[keyA] = link.ConnectionB
		if !link.OneWay {
			index[keyB] = link.ConnectionA
		}
	}
	return index
}

// buildConnectionsByMap indexes all MapConnections by their map identifier.
func buildConnectionsByMap(zone instanceconfig.Zone) map[string][]instanceconfig.MapConnection {
	m := make(map[string][]instanceconfig.MapConnection)
	for _, mp := range zone.Maps {
		m[mp.Identifier] = mp.Connections
	}
	return m
}

// findConnection returns the MapConnection with the given identifier on the named map, or nil.
func findConnection(zone instanceconfig.Zone, mapID, connID string) *instanceconfig.MapConnection {
	for _, mp := range zone.Maps {
		if mp.Identifier != mapID {
			continue
		}
		for i := range mp.Connections {
			if mp.Connections[i].Identifier == connID {
				return &mp.Connections[i]
			}
		}
	}
	return nil
}
