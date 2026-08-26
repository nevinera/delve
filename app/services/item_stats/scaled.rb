# Scales a raw stat hash (from ItemStats::Raw, at em = 1.0) by the elevation
# multiplier for a given effective elevation. See docs/stats.md.
module ItemStats
  class Scaled
    def self.call(...) = new(...).call

    def initialize(raw_stats:, ee:)
      @raw_stats = raw_stats
      @ee = ee
    end

    def call
      multiplier = ElevationMultiplier.for(@ee)
      @raw_stats.transform_values { |value| value * multiplier }
    end
  end
end
