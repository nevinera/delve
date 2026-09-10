module Validators
  # Shared schema for both a unit's powers and a class's abilities - see
  # docs/schema/ability.md. iconURL is only meaningful when the ability is
  # used by a class (unit powers don't have an action bar), but the schema
  # doesn't distinguish the two: whether a given Ability is a "power" or an
  # "ability" is purely a function of where it's referenced from.
  class AbilityValidator < Base
    def validate!(data, path: "$")
      require_object!(data, path: path)
      require_string!(data, "name", path: path)
      validate_cast_time!(data, path: path)
      require_numeric!(data, "globalCooldown", path: path)
      validate_optional_fields!(data, path: path)
      validate_effects!(data, path: path)
    end

    private

    def validate_optional_fields!(data, path:)
      require_string!(data, "description", path: path) if given?(data, "description")
      validate_tags!(data, path: path) if given?(data, "tags")
      validate_icon_url!(data, path: path) if given?(data, "iconURL")
      validate_speed!(data, path: path) if given?(data, "speed")
      validate_graphic_effects!(data, path: path) if given?(data, "graphicEffects")
      validate_sound_effects!(data, path: path) if given?(data, "soundEffects")
    end

    def validate_cast_time!(data, path:)
      cast_time = require_key!(data, "castTime", path: path)
      return if cast_time.nil? || cast_time.is_a?(Numeric)
      raise ValidationError.new("castTime must be a number or null", path: child_path(path, "castTime"))
    end

    def validate_icon_url!(data, path:)
      url = require_string!(data, "iconURL", path: path)
      return unless stock_reference?(url)
      validate_stock_reference!(url, Content::StockAssets::ICONS.keys, path: child_path(path, "iconURL"))
    end

    def validate_speed!(data, path:)
      require_numeric!(data, "speed", path: path)
    end

    def validate_graphic_effects!(data, path:)
      effects = data["graphicEffects"]
      raise ValidationError.new("graphicEffects must be an array", path: child_path(path, "graphicEffects")) unless effects.is_a?(Array)
      effects.each_with_index do |effect, i|
        GraphicEffectValidator.validate!(effect, path: index_path(child_path(path, "graphicEffects"), i))
      end
    end

    def validate_sound_effects!(data, path:)
      effects = data["soundEffects"]
      raise ValidationError.new("soundEffects must be an array", path: child_path(path, "soundEffects")) unless effects.is_a?(Array)
      effects.each_with_index do |effect, i|
        SoundEffectValidator.validate!(effect, path: index_path(child_path(path, "soundEffects"), i))
      end
    end

    def validate_effects!(data, path:)
      effects = require_array!(data, "effects", path: path)
      effects.each_with_index do |effect, i|
        PowerEffectValidator.validate!(effect, path: index_path(child_path(path, "effects"), i))
      end
    end
  end
end
