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
