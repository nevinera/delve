package itemstats

// Scaled scales a raw stat map (from Raw, at em = 1.0) by the elevation
// multiplier for a given effective elevation. Does not mutate raw.
func Scaled(raw map[string]float64, ee float64) map[string]float64 {
	multiplier := ElevationMultiplier(ee)
	scaled := make(map[string]float64, len(raw))
	for stat, value := range raw {
		scaled[stat] = value * multiplier
	}
	return scaled
}

// ScaledSum computes the elevation-scaled sum of stats across several item
// allocations, each scaled against its own effective elevation (its own Elvl
// minus mapElvl) before summing - unlike Scaled, which applies one multiplier
// to an already-summed raw map, this is correct when items have different
// elvls (docs/stats.md: "every stat an item grants is scaled by how far the
// item's elvl sits from the elvl it's being used at").
func ScaledSum(allocations []Allocation, mapElvl float64) map[string]float64 {
	total := make(map[string]float64)
	for _, a := range allocations {
		raw := Raw(a)
		for stat, value := range Scaled(raw, float64(a.Elvl)-mapElvl) {
			total[stat] += value
		}
	}
	return total
}
