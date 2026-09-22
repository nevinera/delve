module Validators
  class ResourceTypeValidator < Base
    DISPLAY_TYPES = %w[primary].freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      require_string!(data, "name", path: path)
      validate_hex_color!(data, "color", path: path)
      require_numeric!(data, "max", path: path)
      require_numeric!(data, "defaultValue", path: path)
      validate_return_rate!(data, path: path) if given?(data, "returnRate")
      require_boolean!(data, "isFluid", path: path)
      validate_display_type!(data, path: path) if given?(data, "displayType")
      require_boolean!(data, "hasteAffected", path: path) if given?(data, "hasteAffected")
    end

    private

    def validate_return_rate!(data, path:)
      rate = data["returnRate"]
      return if rate.is_a?(Numeric) && rate >= 0
      raise ValidationError.new("returnRate must be a non-negative number", path: child_path(path, "returnRate"))
    end

    def validate_display_type!(data, path:)
      type = require_string!(data, "displayType", path: path)
      require_one_of!(type, DISPLAY_TYPES, path: child_path(path, "displayType"))
    end
  end
end
