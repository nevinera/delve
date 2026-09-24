module Validators
  # A non-combat unit (docs/schema/ncu.md).
  class NcuValidator < Base
    def validate!(data, path: "$")
      require_object!(data, path: path)
      validate_identity!(data, path: path)
      validate_token!(data, path: path)
      validate_position!(require_hash!(data, "position", path: path), path: child_path(path, "position"))
      validate_speed_factor!(data, path: path) if given?(data, "speedFactor")
      UnitMovementValidator.validate!(data["movement"], path: child_path(path, "movement")) if given?(data, "movement")
      validate_dialogue!(data, path: path) if given?(data, "dialogue")
    end

    private

    def validate_identity!(data, path:)
      require_string!(data, "identifier", path: path)
      require_string!(data, "name", path: path)
    end

    def validate_token!(data, path:)
      url = require_string!(data, "tokenImageUrl", path: path)
      raise ValidationError.new("tokenImageUrl must not be empty", path: child_path(path, "tokenImageUrl")) if url.strip.empty?
      radius = require_numeric!(data, "tokenRadius", path: path)
      return if radius.between?(1.0, 20.0)
      raise ValidationError.new("tokenRadius must be between 1.0 and 20.0", path: child_path(path, "tokenRadius"))
    end

    def validate_speed_factor!(data, path:)
      speed = require_numeric!(data, "speedFactor", path: path)
      return if speed.between?(0.0, 10.0)
      raise ValidationError.new("speedFactor must be between 0.0 and 10.0", path: child_path(path, "speedFactor"))
    end

    def validate_dialogue!(data, path:)
      lines = require_array!(data, "dialogue", path: path)
      lines.each_with_index do |line, i|
        next if line.is_a?(String) && !line.strip.empty?
        raise ValidationError.new("dialogue lines must be non-empty strings", path: index_path(child_path(path, "dialogue"), i))
      end
    end
  end
end
