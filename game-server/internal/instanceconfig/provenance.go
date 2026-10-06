package instanceconfig

import "slices"

// ProvenanceLayer is one set of provenance restrictions (a world's or a
// zone's) as Rails resolves it for a slot request - see
// docs/schema/common.md#provenancerestrictions. Worlds nil means any world;
// otherwise the items' world must be the owning world or listed.
type ProvenanceLayer struct {
	Worlds       []string `json:"worlds"`
	MaxElevation *int     `json:"maxElevation"`
}

// ProvenanceRestrictions limits which equipped items count as worn in an
// instance. WorldKey is the owning world ("" when a zone is played alone);
// an item must pass every layer. Trainee gear (no world) always passes.
type ProvenanceRestrictions struct {
	WorldKey string            `json:"world_key"`
	Layers   []ProvenanceLayer `json:"layers"`
}

// Allows reports whether item may be worn under r.
func (r ProvenanceRestrictions) Allows(item EquippedItem) bool {
	if item.WorldKey == nil {
		return true
	}
	for _, layer := range r.Layers {
		if layer.MaxElevation != nil && item.Elvl > *layer.MaxElevation {
			return false
		}
		if layer.Worlds != nil && *item.WorldKey != r.WorldKey && !slices.Contains(layer.Worlds, *item.WorldKey) {
			return false
		}
	}
	return true
}

// Worn returns the items of equipped that may be worn under r.
func (r ProvenanceRestrictions) Worn(equipped map[string]EquippedItem) map[string]EquippedItem {
	if equipped == nil || len(r.Layers) == 0 {
		return equipped
	}
	worn := make(map[string]EquippedItem, len(equipped))
	for slot, item := range equipped {
		if r.Allows(item) {
			worn[slot] = item
		}
	}
	return worn
}
