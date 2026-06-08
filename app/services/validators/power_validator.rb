module Validators
  class PowerValidator < Base
    def validate!(data, path: "$")
      require_object!(data, path: path)
      require_string!(data, "name", path: path)
      validate_cast_time!(data, path: path)
      require_numeric!(data, "globalCooldown", path: path)
      validate_graphic_effects!(data, path: path) if data.key?("graphicEffects")
      validate_sound_effects!(data, path: path) if data.key?("soundEffects")
      validate_effects!(data, path: path)
    end

    private

    def validate_cast_time!(data, path:)
      cast_time = require_key!(data, "castTime", path: path)
      return if cast_time.nil? || cast_time.is_a?(Numeric)
      raise ValidationError.new("castTime must be a number or null", path: child_path(path, "castTime"))
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
