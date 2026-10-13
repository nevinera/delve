module Validators
  # A map's placed decoration stamps (docs/schema/map.md#placedstamp), in
  # map feet, drawn in list order. Which stamps exist is the zone's to say
  # (ZoneValidator checks each against its stamps).
  class StampPlacementsValidator < Base
    MAX_STAMPS = 2000
    MAX_SCALE = 20
    STAMP_RE = %r{\A[a-z0-9][a-z0-9_-]*/[a-z0-9][a-z0-9_-]*\z}

    def validate!(stamps, path: "$")
      raise ValidationError.new("must be an array", path: path) unless stamps.is_a?(Array)
      raise ValidationError.new("has #{stamps.length} stamps, more than the maximum of #{MAX_STAMPS}", path: path) if stamps.length > MAX_STAMPS
      stamps.each_with_index { |stamp, i| validate_stamp!(stamp, path: index_path(path, i)) }
    end

    private

    def validate_stamp!(data, path:)
      require_object!(data, path: path)
      stamp = require_string!(data, "stamp", path: path)
      raise ValidationError.new("stamp must be set/stamp, like camp/tent", path: child_path(path, "stamp")) unless STAMP_RE.match?(stamp)
      validate_location!(data, path: path)
      require_numeric!(data, "rotation", path: path) if given?(data, "rotation")
      validate_scale!(data, path: path) if given?(data, "scale")
      validate_variant!(data, path: path) if given?(data, "variant")
    end

    def validate_scale!(data, path:)
      scale = require_numeric!(data, "scale", path: path)
      raise ValidationError.new("scale must be more than 0 and at most #{MAX_SCALE}", path: child_path(path, "scale")) unless scale > 0 && scale <= MAX_SCALE
    end

    def validate_variant!(data, path:)
      variant = require_integer!(data, "variant", path: path)
      raise ValidationError.new("variant must be at least 0", path: child_path(path, "variant")) if variant < 0
    end
  end
end
