package instance

import "time"

// SelectBestInstance returns the best legacy-mode candidate for zone
// identifier + version (see pickFullest). Returns nil if no suitable
// instance exists.
//
// candidates should be a registry snapshot (e.g. from Registry.List).
func SelectBestInstance(candidates []*Instance, zoneIdentifier, version string) *Instance {
	return pickFullest(candidates, func(inst *Instance) bool {
		return inst.Mode == ModeLegacy && inst.ZoneIdentifier == zoneIdentifier && inst.Version == version
	})
}

// SelectKeyedInstance returns the best candidate with exactly this mode and
// Rails-chosen instance key (see pickFullest), so world, direct, and legacy
// players never share an instance. Returns nil if none is suitable.
func SelectKeyedInstance(candidates []*Instance, mode Mode, key string) *Instance {
	return pickFullest(candidates, func(inst *Instance) bool {
		return inst.Mode == mode && inst.InstanceKey == key
	})
}

// pickFullest returns the fullest active, unexpired matching instance with
// remaining capacity, preferring the newest among ties.
func pickFullest(candidates []*Instance, matches func(*Instance) bool) *Instance {
	var best *Instance
	var bestTotal int
	now := time.Now()

	for _, inst := range candidates {
		if inst.Status != StatusActive || !matches(inst) || inst.expiredAt(now) {
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
