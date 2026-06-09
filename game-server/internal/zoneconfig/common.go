package zoneconfig

import (
	"encoding/json"
	"fmt"
)

// Location is a point in map coordinates (feet).
type Location struct {
	X float64 `json:"x"` // Required: distance east from map origin
	Y float64 `json:"y"` // Required: distance north from map origin
}

// Position is a Location with a facing direction.
type Position struct {
	X     float64 `json:"x"`     // Required
	Y     float64 `json:"y"`     // Required
	Angle float64 `json:"angle"` // Required: degrees, 0=north, clockwise positive
}

// ValueRange represents a value that can be a fixed float or a [min, max] range.
// A single float x unmarshals as [x, x] (no variance).
// Used for: damage amounts, movement speeds, wait times.
type ValueRange [2]float64

func (v *ValueRange) UnmarshalJSON(data []byte) error {
	var single float64
	if err := json.Unmarshal(data, &single); err == nil {
		v[0], v[1] = single, single
		return nil
	}
	var pair [2]float64
	if err := json.Unmarshal(data, &pair); err != nil {
		return fmt.Errorf("expected float or [min, max] pair: %w", err)
	}
	v[0], v[1] = pair[0], pair[1]
	return nil
}

func (v ValueRange) Min() float64 { return v[0] }
func (v ValueRange) Max() float64 { return v[1] }

// ZeroBasedValueRange represents a distance or range constraint.
// A single float x unmarshals as [0, x] (from zero up to x).
// Used for: power range fields, fuzz radii.
type ZeroBasedValueRange [2]float64

func (v *ZeroBasedValueRange) UnmarshalJSON(data []byte) error {
	var single float64
	if err := json.Unmarshal(data, &single); err == nil {
		v[0], v[1] = 0, single
		return nil
	}
	var pair [2]float64
	if err := json.Unmarshal(data, &pair); err != nil {
		return fmt.Errorf("expected float or [min, max] pair: %w", err)
	}
	v[0], v[1] = pair[0], pair[1]
	return nil
}

func (v ZeroBasedValueRange) Min() float64 { return v[0] }
func (v ZeroBasedValueRange) Max() float64 { return v[1] }
