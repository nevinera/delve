module Validators
  # Settable on World and Zone (docs/schema/common.md#provenancerestrictions) -
  # shared by both, since the shape is identical.
  class ProvenanceRestrictionsValidator < Base
    def validate!(data, path: "$")
      require_object!(data, path: path)
      validate_worlds!(data, path: path) if given?(data, "worlds")
      validate_max_elevation!(data, path: path) if given?(data, "maxElevation")
    end

    private

    def validate_worlds!(data, path:)
      worlds = require_array!(data, "worlds", path: path)
      worlds.each_with_index do |key, i|
        next if key.is_a?(String) && !key.strip.empty?
        raise ValidationError.new("worlds entries must be non-empty strings", path: index_path(child_path(path, "worlds"), i))
      end
    end

    def validate_max_elevation!(data, path:)
      max = require_integer!(data, "maxElevation", path: path)
      raise ValidationError.new("maxElevation must be at least 0", path: child_path(path, "maxElevation")) if max < 0
    end
  end
end
