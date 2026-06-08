module Validators
  class PowerValidator < Base
    def validate!(data, path: "$")
      require_object!(data, path: path)
      require_string!(data, "name", path: path)

      cast_time = require_key!(data, "castTime", path: path)
      unless cast_time.nil? || cast_time.is_a?(Numeric)
        raise ValidationError.new("castTime must be a number or null", path: child_path(path, "castTime"))
      end

      require_numeric!(data, "globalCooldown", path: path)

      if data.key?("graphicEffects")
        graphic_effects = data["graphicEffects"]
        raise ValidationError.new("graphicEffects must be an array", path: child_path(path, "graphicEffects")) unless graphic_effects.is_a?(Array)
        graphic_effects.each_with_index do |effect, i|
          GraphicEffectValidator.validate!(effect, path: index_path(child_path(path, "graphicEffects"), i))
        end
      end

      if data.key?("soundEffects")
        sound_effects = data["soundEffects"]
        raise ValidationError.new("soundEffects must be an array", path: child_path(path, "soundEffects")) unless sound_effects.is_a?(Array)
        sound_effects.each_with_index do |effect, i|
          SoundEffectValidator.validate!(effect, path: index_path(child_path(path, "soundEffects"), i))
        end
      end

      effects = require_array!(data, "effects", path: path)
      effects.each_with_index do |effect, i|
        PowerEffectValidator.validate!(effect, path: index_path(child_path(path, "effects"), i))
      end
    end
  end
end
