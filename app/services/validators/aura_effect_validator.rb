module Validators
  # An AuraEffect is a persistent visual attached to a unit for as long as a
  # Status is active on it - always centered on the status holder, sized by
  # the unit's own token radius as well as scale. Distinct from GraphicEffect
  # (a fixed-duration cast/impact effect): it has no duration/from/to/when/
  # condition, since those describe a one-shot effect this isn't.
  class AuraEffectValidator < Base
    def validate!(data, path: "$")
      require_object!(data, path: path)
      validate_graphic_source_url!(data, path: path)
      validate_graphic_sprite_sheet!(data, path: path)
    end
  end
end
