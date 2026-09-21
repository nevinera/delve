package dpssim

import "math"

// resourceRetryInterval mirrors instance.TickInterval (duplicated rather
// than imported - see package doc: this package mirrors the real engine's
// math/constants rather than importing it). When every shape-usable power
// is momentarily unaffordable or on cooldown, Simulate retries at this
// cadence rather than giving up for the rest of the run, since both
// resource and cooldowns change with time.
const resourceRetryInterval = 0.1

// clampResource bounds a resource value to [0, max] - mirrors
// command.ClampResource.
func clampResource(value, max float64) float64 {
	if value < 0 {
		return 0
	}
	if value > max {
		return max
	}
	return value
}

// regenResource moves current toward defaultValue by rate*elapsed - mirrors
// instance.tickResourceRegen's per-tick step, generalized to an arbitrary
// elapsed duration since Simulate's event loop jumps straight to the next
// event rather than stepping in fixed ticks.
func regenResource(current, defaultValue, rate, elapsed float64) float64 {
	if rate == 0 || elapsed <= 0 {
		return current
	}
	step := rate * elapsed
	if current < defaultValue {
		return math.Min(current+step, defaultValue)
	}
	if current > defaultValue {
		return math.Max(current-step, defaultValue)
	}
	return current
}
