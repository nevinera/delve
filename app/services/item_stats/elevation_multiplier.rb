# Converts effective elevation (ee = item elvl - map elvl) into the elevation
# multiplier (em) used to scale item stats. See docs/stats.md.
module ItemStats
  module ElevationMultiplier
    module_function

    def for(ee)
      base(ee) * taper(ee)
    end

    def base(ee) = 2.0 / (1 + 3.0**(-ee / 10.0))

    def taper(ee)
      return 1.0 if ee.abs <= 10
      return (ee + 20) / 10.0 if ee >= -20 && ee < -10
      return 1 + (ee - 10) / 90.0 if ee > 10 && ee <= 20
      return 0.0 if ee < -20
      10.0 / 9
    end
  end
end
