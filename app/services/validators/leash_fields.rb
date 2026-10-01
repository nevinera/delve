module Validators
  # The optional leash settings shared by a map and a placed unit (see
  # docs/schema/map.md, unit.md): a unit's own values override its map's.
  module LeashFields
    include Helpers

    def validate_leash_fields!(data, path:)
      validate_leash_radius!(data, path:) if given?(data, "leashRadius")
      require_boolean!(data, "hardLeash", path:) if given?(data, "hardLeash")
    end

    private

    def validate_leash_radius!(data, path:)
      radius = require_numeric!(data, "leashRadius", path:)
      raise ValidationError.new("leashRadius must be greater than 0", path: child_path(path, "leashRadius")) unless radius.positive?
    end
  end
end
