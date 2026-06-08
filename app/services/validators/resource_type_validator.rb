module Validators
  class ResourceTypeValidator < Base
    HEX_COLOR_RE = /\A[0-9a-fA-F]{6}\z/

    def validate!(data, path: "$")
      require_object!(data, path: path)
      require_string!(data, "name", path: path)
      validate_color!(data, path: path)
      require_numeric!(data, "max", path: path)
      require_numeric!(data, "defaultValue", path: path)
      validate_return_rate!(data, path: path) if data.key?("returnRate")
      require_boolean!(data, "isFluid", path: path)
    end

    private

    def validate_color!(data, path:)
      color = require_string!(data, "color", path: path)
      return if HEX_COLOR_RE.match?(color)
      raise ValidationError.new("color must be a 6-digit hex string without #", path: child_path(path, "color"))
    end

    def validate_return_rate!(data, path:)
      rate = data["returnRate"]
      return if rate.is_a?(Numeric) && rate >= 0
      raise ValidationError.new("returnRate must be a non-negative number", path: child_path(path, "returnRate"))
    end
  end
end
