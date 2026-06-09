package zoneconfig

// Map is one visual floor or area within a Zone.
// imageUrl and pixelDimensions are client-only and omitted; the JSON decoder
// silently ignores them.
type Map struct {
	Identifier     string          `json:"identifier"`     // Required
	Name           string          `json:"name"`           // Required
	FeetDimensions Dimensions      `json:"feetDimensions"` // Required: world bounds in feet
	Barriers       []Barrier       `json:"barriers,omitempty"`
	Connections    []MapConnection `json:"connections,omitempty"`
	Units          []Unit          `json:"units,omitempty"`
}

// Dimensions holds the width and height of a map in feet.
type Dimensions struct {
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

// Barrier blocks unit movement and line-of-sight.
// Type discriminator: "wall" or "circle".
//
// wall fields:  Locations
// circle fields: Location, Radius
type Barrier struct {
	Type string `json:"type"` // Required: "wall" or "circle"

	// wall
	Locations []Location `json:"locations,omitempty"` // Required for wall: ≥2 points

	// circle
	Location *Location `json:"location,omitempty"` // Required for circle: center
	Radius   float64   `json:"radius,omitempty"`   // Required for circle: feet, max 30.0
}

// MapConnection is an entry/exit point on a map.
// Type discriminator: "point" or "line".
//
// point fields: Position, FuzzRadius, FuzzAngle
// line fields:  Start, End
type MapConnection struct {
	Identifier string `json:"identifier"` // Required
	Type       string `json:"type"`       // Required: "point" or "line"

	// point
	Position   *Position `json:"position,omitempty"`   // Required for point
	FuzzRadius float64   `json:"fuzzRadius,omitempty"` // Required for point: 0.0-20.0
	FuzzAngle  float64   `json:"fuzzAngle,omitempty"`  // Required for point: 0.0-360.0

	// line
	Start *Location `json:"start,omitempty"` // Required for line
	End   *Location `json:"end,omitempty"`   // Required for line
}
