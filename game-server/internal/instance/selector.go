package instance

// SelectBestInstance returns the best candidate from candidates for a new slot:
// the fullest active instance with remaining capacity, preferring the newest
// among ties. Returns nil if no suitable instance exists.
//
// candidates should be a registry snapshot (e.g. from Registry.List).
func SelectBestInstance(candidates []*Instance, zoneIdentifier, version string) *Instance {
	var best *Instance
	var bestTotal int

	for _, inst := range candidates {
		if inst.Status != StatusActive {
			continue
		}
		if inst.ZoneIdentifier != zoneIdentifier || inst.Version != version {
			continue
		}
		total, _ := inst.SlotCounts()
		if total >= inst.MaxSlots {
			continue
		}
		if best == nil || total > bestTotal || (total == bestTotal && inst.CreatedAt.After(best.CreatedAt)) {
			best = inst
			bestTotal = total
		}
	}

	return best
}
