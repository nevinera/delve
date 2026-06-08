module Validators
  class ResourceTypeValidator < Base
    HEX_COLOR_RE = /\A[0-9a-fA-F]{6}\z/

    def validate!(data, path: "$")
      require_object!(data, path: path)
      require_string!(data, "name", path: path)
      color = require_string!(data, "color", path: path)
      unless HEX_COLOR_RE.match?(color)
        raise ValidationError.new("color must be a 6-digit hex string without #", path: child_path(path, "color"))
      end
      require_numeric!(data, "max", path: path)
      require_numeric!(data, "defaultValue", path: path)
      if data.key?("returnRate")
        rate = data["returnRate"]
        unless rate.is_a?(Numeric) && rate >= 0
          raise ValidationError.new("returnRate must be a non-negative number", path: child_path(path, "returnRate"))
        end
      end
      require_boolean!(data, "isFluid", path: path)
    end
  end
end
