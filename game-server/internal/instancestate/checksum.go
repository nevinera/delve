package instancestate

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
)

type canonicalEffect struct {
	ID        string `json:"id"` // Status.Name + ":" + ApplierID - unique per (name, applier)
	Stacks    int    `json:"stacks"`
	ExpiresAt int64  `json:"expiresAt"`
}

type canonicalResource struct {
	Name    string  `json:"name"`
	Current float64 `json:"current"`
	Max     float64 `json:"max"`
}

type canonicalUnit struct {
	ID        string              `json:"id"`
	Map       string              `json:"map"`
	X         float64             `json:"x"`
	Y         float64             `json:"y"`
	Angle     float64             `json:"angle"`
	Health    float64             `json:"health"`
	MaxHealth float64             `json:"maxHealth"`
	Resources []canonicalResource `json:"resources"`
	Status    UnitStatus          `json:"status"`
	Effects   []canonicalEffect   `json:"effects"`
}

// Checksum returns a SHA256 hex digest of the instance state in a canonical
// JSON form. Units are sorted by ZoneUnitIdentifier; effects within each unit
// are sorted by (Status.Name, ApplierID). JS clients reproduce this identically;
// Ruby clients need to drop trailing ".0" from whole-number floats before hashing.
func (s *InstanceState) Checksum() string {
	units := make([]canonicalUnit, 0, len(s.Units))
	for _, u := range s.Units {
		effects := make([]canonicalEffect, len(u.ActiveStatusEffects))
		for i, e := range u.ActiveStatusEffects {
			effects[i] = canonicalEffect{
				ID:        e.Status.Name + ":" + e.ApplierID.String(),
				Stacks:    e.Stacks,
				ExpiresAt: e.ExpiresAt.UnixMilli(),
			}
		}
		sort.Slice(effects, func(i, j int) bool { return effects[i].ID < effects[j].ID })

		resources := make([]canonicalResource, 0, len(u.Resources))
		for name, r := range u.Resources {
			resources = append(resources, canonicalResource{Name: name, Current: r.Current, Max: r.Max})
		}
		sort.Slice(resources, func(i, j int) bool { return resources[i].Name < resources[j].Name })

		units = append(units, canonicalUnit{
			ID:        u.ZoneUnitIdentifier,
			Map:       u.MapIdentifier,
			X:         u.Position.X,
			Y:         u.Position.Y,
			Angle:     u.Position.Angle,
			Health:    u.Health,
			MaxHealth: u.MaxHealth,
			Resources: resources,
			Status:    u.Status,
			Effects:   effects,
		})
	}
	sort.Slice(units, func(i, j int) bool { return units[i].ID < units[j].ID })

	data, _ := json.Marshal(units)
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
