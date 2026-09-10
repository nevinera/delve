module Validators
  class ResourceTypeValidator < Base
    def validate!(data, path: "$")
      require_object!(data, path: path)
      require_string!(data, "name", path: path)
      validate_hex_color!(data, "color", path: path)
      require_numeric!(data, "max", path: path)
      require_numeric!(data, "defaultValue", path: path)
      validate_return_rate!(data, path: path) if given?(data, "returnRate")
      require_boolean!(data, "isFluid", path: path)
    end

    private

    def validate_return_rate!(data, path:)
      rate = data["returnRate"]
      return if rate.is_a?(Numeric) && rate >= 0
      raise ValidationError.new("returnRate must be a non-negative number", path: child_path(path, "returnRate"))
    end
  end
end
