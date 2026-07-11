package instance

import (
	"math"
	"strings"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

const connectionTriggerDist = 1.5 // feet — how close a unit must be to a line connection to trigger it

// applyMapTransitions checks every non-dead unit against the connections on
// their current map and teleports them through any ZoneLink they are touching.
// Called after applyMovement, before resolveCollisions.
// prevState is the InstanceState from before applyMovement this tick; it is
// used to determine which side of a connection each unit approached from.
func applyMapTransitions(state *instancestate.InstanceState, prevState *instancestate.InstanceState, zone instanceconfig.Zone) {
	linkIndex := buildLinkIndex(zone)
	connsByMap := buildConnectionsByMap(zone)

	for unitID, unit := range state.Units {
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
			destMap := findMap(zone, dest.Map)
			if destMap == nil {
				continue
			}
			var prevX, prevY float64
			if prevState != nil {
				if prevUnit, ok := prevState.Units[unitID]; ok {
					prevX, prevY = prevUnit.Position.X, prevUnit.Position.Y
				} else {
					prevX, prevY = unit.Position.X, unit.Position.Y
				}
			} else {
				prevX, prevY = unit.Position.X, unit.Position.Y
			}
			traverseConnection(unit, conn, *destMap, *destConn, prevX, prevY, state)
			break // one transition per tick per unit
		}
	}
}

// traverseConnection moves unit to the destination map and connection.
// prevX/prevY is the unit's position from the previous tick, used to determine
// which side of fromConn the unit approached from.
// Drops aggro on the unit and on any unit that was targeting it.
func traverseConnection(unit *instancestate.UnitState, fromConn instanceconfig.MapConnection, destMap instanceconfig.Map, destConn instanceconfig.MapConnection, prevX, prevY float64, state *instancestate.InstanceState) {
	unit.MapIdentifier = destMap.Identifier
	unit.Position = spawnPosition(fromConn, destConn, prevX, prevY, unit.Position.Angle)

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

const spawnNudge = 2.0 // feet past the destination connection

// spawnPosition computes where a unit emerges on destConn given that it was at
// (prevX, prevY) last tick (before triggering) and is now touching fromConn.
//
// The t-position along fromConn is preserved onto destConn (first point of each
// segment corresponds). The spawn point is then nudged spawnNudge feet to the
// far side of the connection — opposite the side the unit approached from.
func spawnPosition(fromConn, destConn instanceconfig.MapConnection, prevX, prevY float64, facingDeg float64) instanceconfig.Position {
	if fromConn.Start == nil || fromConn.End == nil || destConn.Start == nil || destConn.End == nil {
		if destConn.Position != nil {
			return *destConn.Position
		}
		return instanceconfig.Position{}
	}

	// Project previous position onto fromConn to get t ∈ [0,1].
	fDX := fromConn.End.X - fromConn.Start.X
	fDY := fromConn.End.Y - fromConn.Start.Y
	fLenSq := fDX*fDX + fDY*fDY
	var t float64
	if fLenSq > 0 {
		t = ((prevX-fromConn.Start.X)*fDX + (prevY-fromConn.Start.Y)*fDY) / fLenSq
		t = math.Max(0, math.Min(1, t))
	}

	// Interpolate the same t onto destConn.
	dDX := destConn.End.X - destConn.Start.X
	dDY := destConn.End.Y - destConn.Start.Y
	sx := destConn.Start.X + t*dDX
	sy := destConn.Start.Y + t*dDY

	// Use the previous position's signed distance from the fromConn line to
	// determine which side the unit approached from, then nudge to the FAR side
	// on destConn (opposite side = past the connection into the destination map).
	// Left perpendicular of (fDX, fDY) is (-fDY, fDX).
	fLen := math.Sqrt(fLenSq)
	var approachFromLeft float64
	if fLen > 0 {
		approachFromLeft = ((prevX-fromConn.Start.X)*(-fDY) + (prevY-fromConn.Start.Y)*fDX) / fLen
	}

	// Left perpendicular of destConn direction: nudge toward the far side.
	destNudgeX, destNudgeY := -dDY, dDX
	if dLen := math.Sqrt(destNudgeX*destNudgeX + destNudgeY*destNudgeY); dLen > 0 {
		destNudgeX /= dLen
		destNudgeY /= dLen
	}
	// Approach from left side → emerged on right side of fromConn → far side on
	// dest is the right side (negate left perp). Approach from right → left side.
	if approachFromLeft >= 0 {
		destNudgeX, destNudgeY = -destNudgeX, -destNudgeY
	}
	sx += destNudgeX * spawnNudge
	sy += destNudgeY * spawnNudge

	return instanceconfig.Position{X: sx, Y: sy, Angle: facingDeg}
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

// findMap returns the Map with the given identifier, or nil.
func findMap(zone instanceconfig.Zone, mapID string) *instanceconfig.Map {
	for i := range zone.Maps {
		if zone.Maps[i].Identifier == mapID {
			return &zone.Maps[i]
		}
	}
	return nil
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
