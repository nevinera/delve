// Package dpsspread is the "second calculator" layer over internal/dpssim:
// given only an enemy UnitType, it builds several mocked-up, fully-itemized
// target gear sets (one per GearingPlan) at several relative elevations,
// and runs dpssim.Simulate once per (plan x elevation) cell - producing the
// DPS/TTD matrix a unit-type editor would actually want, rather than
// requiring a caller to hand-pick raw target stats (that's dpssim's job,
// and stays internal to this package and dpssim's own tests).
//
// Each plan is a real (mocked) 14-item kit - one item per
// head/neck/shoulders/back/chest/wrists/hands/waist/legs/feet/ring/ring/
// main_hand/off_hand slot, per docs/stats.md's "Slots" table - run through
// itemstats.Raw/Scaled exactly like a real character's gear would be, so
// the resulting stats are whatever that real math produces, not
// hand-picked numbers. Elevation is applied uniformly across the whole kit
// via itemstats.Scaled(rawTotals, ee) rather than itemstats.ScaledSum's
// per-item Elvl bookkeeping, since every item in a mocked kit shares the
// same relative elevation by construction.
//
// The post-ScaledSum Versatility-spread and Stamina->MaxHealth conversion
// mirror internal/command's unitEffectiveStats/PlayerMaxHealth - see this
// package's mirrored constants for the exact values.
package dpsspread
