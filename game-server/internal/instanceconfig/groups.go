package instanceconfig

// GroupedUnits returns, for each unit identifier, every other unit
// identifier that shares its non-empty groupIdentifier on the same map -
// these units aggro together (see command.EngageOnAttack). Grouping never
// crosses maps, even if two different maps happen to reuse the same
// groupIdentifier string.
func GroupedUnits(zone Zone) map[string][]string {
	result := make(map[string][]string)
	for _, mp := range zone.Maps {
		byGroup := make(map[string][]string)
		for _, u := range mp.Units {
			if u.GroupIdentifier == "" {
				continue
			}
			byGroup[u.GroupIdentifier] = append(byGroup[u.GroupIdentifier], u.Identifier)
		}
		for _, members := range byGroup {
			for _, id := range members {
				for _, other := range members {
					if other != id {
						result[id] = append(result[id], other)
					}
				}
			}
		}
	}
	return result
}
