package instanceconfig

// SymmetricLinkGroups returns a map from unit identifier to every unit
// linked to it, treating links as symmetric: if A lists B, both A→B and
// B→A are included, so zone configs don't need to define links in both
// directions.
func SymmetricLinkGroups(zone Zone) map[string][]string {
	seen := make(map[string]map[string]struct{})
	add := func(a, b string) {
		if seen[a] == nil {
			seen[a] = make(map[string]struct{})
		}
		seen[a][b] = struct{}{}
	}
	for _, mp := range zone.Maps {
		for _, u := range mp.Units {
			for _, link := range u.Links {
				add(u.Identifier, link)
				add(link, u.Identifier)
			}
		}
	}
	result := make(map[string][]string, len(seen))
	for id, set := range seen {
		links := make([]string, 0, len(set))
		for link := range set {
			links = append(links, link)
		}
		result[id] = links
	}
	return result
}
