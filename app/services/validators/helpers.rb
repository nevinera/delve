module Validators
  module Helpers
    module_function

    def asset_reference?(value)
      value.is_a?(Hash) && value.key?("$ref")
    end

    def reject_asset_reference!(value, path:)
      return unless asset_reference?(value)
      raise ValidationError.new("full JSON required; AssetReference not permitted here", path: path)
    end

    def require_object!(data, path:)
      reject_asset_reference!(data, path: path)
      raise ValidationError.new("must be an object", path: path) unless data.is_a?(Hash)
      data
    end

    def require_key!(data, key, path:)
      k = key.to_s
      raise ValidationError.new("#{key} is required", path: child_path(path, key)) unless data.key?(k)
      data[k]
    end

    def require_string!(data, key, path:)
      val = require_key!(data, key, path: path)
      raise ValidationError.new("#{key} must be a string", path: child_path(path, key)) unless val.is_a?(String)
      val
    end

    def require_boolean!(data, key, path:)
      val = require_key!(data, key, path: path)
      unless val == true || val == false
        raise ValidationError.new("#{key} must be a boolean", path: child_path(path, key))
      end
      val
    end

    def require_integer!(data, key, path:)
      val = require_key!(data, key, path: path)
      raise ValidationError.new("#{key} must be an integer", path: child_path(path, key)) unless val.is_a?(Integer)
      val
    end

    def require_numeric!(data, key, path:)
      val = require_key!(data, key, path: path)
      raise ValidationError.new("#{key} must be a number", path: child_path(path, key)) unless val.is_a?(Numeric)
      val
    end

    def require_array!(data, key, path:, min: 0)
      val = require_key!(data, key, path: path)
      raise ValidationError.new("#{key} must be an array", path: child_path(path, key)) unless val.is_a?(Array)
      if min > 0 && val.length < min
        raise ValidationError.new("#{key} must have at least #{min} elements", path: child_path(path, key))
      end
      val
    end

    def require_hash!(data, key, path:)
      val = require_key!(data, key, path: path)
      raise ValidationError.new("#{key} must be an object", path: child_path(path, key)) unless val.is_a?(Hash)
      val
    end

    def require_one_of!(value, options, path:)
      return if options.include?(value)
      raise ValidationError.new("must be one of: #{options.map(&:inspect).join(", ")}", path: path)
    end

    def validate_float_or_range!(value, path:)
      if value.is_a?(Array)
        raise ValidationError.new("must be a two-element [min, max] range", path: path) unless value.length == 2
        raise ValidationError.new("range elements must be numbers", path: path) unless value.all? { |v| v.is_a?(Numeric) }
      elsif !value.is_a?(Numeric)
        raise ValidationError.new("must be a number or [min, max] range", path: path)
      end
    end

    def validate_location!(data, path:)
      require_object!(data, path: path)
      require_numeric!(data, "x", path: path)
      require_numeric!(data, "y", path: path)
    end

    def validate_position!(data, path:)
      require_object!(data, path: path)
      require_numeric!(data, "x", path: path)
      require_numeric!(data, "y", path: path)
      angle = require_numeric!(data, "angle", path: path)
      unless angle >= 0 && angle <= 360
        raise ValidationError.new("angle must be between 0 and 360", path: child_path(path, "angle"))
      end
    end

    def child_path(path, key)
      "#{path}.#{key}"
    end

    def index_path(path, i)
      "#{path}[#{i}]"
    end
  end
end
