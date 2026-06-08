module Validators
  class PowerEffectValidator < Base
    TYPE_OPTIONS = %w[harm heal resource status].freeze
    AFFECTS_OPTIONS = %w[bTarget gTarget bAll gAll self].freeze
    HARM_AFFECTS_OPTIONS = %w[bTarget gTarget bAll gAll].freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      type = require_string!(data, "type", path: path)
      require_one_of!(type, TYPE_OPTIONS, path: child_path(path, "type"))
      validate_tags!(data, path: path) if data.key?("tags")

      case type
      when "harm" then validate_harm!(data, path: path)
      when "heal" then validate_heal!(data, path: path)
      when "resource" then validate_resource!(data, path: path)
      when "status" then validate_status!(data, path: path)
      end
    end

    private

    def validate_tags!(data, path:)
      tags = data["tags"]
      tags_path = child_path(path, "tags")
      raise ValidationError.new("tags must be an array", path: tags_path) unless tags.is_a?(Array)
      raise ValidationError.new("tags may not exceed 24 items", path: tags_path) if tags.length > 24
      tags.each_with_index { |tag, i| validate_tag!(tag, path: index_path(tags_path, i)) }
    end

    def validate_tag!(tag, path:)
      raise ValidationError.new("tag must be a string", path: path) unless tag.is_a?(String)
      raise ValidationError.new("tag must be 16 characters or fewer", path: path) if tag.length > 16
    end

    def validate_harm!(data, path:)
      affects = require_string!(data, "affects", path: path)
      require_one_of!(affects, HARM_AFFECTS_OPTIONS, path: child_path(path, "affects"))
      amount = require_key!(data, "amount", path: path)
      validate_float_or_range!(amount, path: child_path(path, "amount"))
      range_val = require_key!(data, "range", path: path)
      validate_float_or_range!(range_val, path: child_path(path, "range"))
    end

    def validate_heal!(data, path:)
      affects = require_string!(data, "affects", path: path)
      require_one_of!(affects, AFFECTS_OPTIONS, path: child_path(path, "affects"))
      amount = require_key!(data, "amount", path: path)
      validate_float_or_range!(amount, path: child_path(path, "amount"))
      if affects != "self"
        range_val = require_key!(data, "range", path: path)
        validate_float_or_range!(range_val, path: child_path(path, "range"))
      end
    end

    def validate_resource!(data, path:)
      affects = require_string!(data, "affects", path: path)
      require_one_of!(affects, AFFECTS_OPTIONS, path: child_path(path, "affects"))
      require_string!(data, "resourceName", path: path)
      require_numeric!(data, "delta", path: path)
      if affects != "self"
        range_val = require_key!(data, "range", path: path)
        validate_float_or_range!(range_val, path: child_path(path, "range"))
      end
    end

    def validate_status!(data, path:)
      affects = require_string!(data, "affects", path: path)
      require_one_of!(affects, AFFECTS_OPTIONS, path: child_path(path, "affects"))
      require_numeric!(data, "duration", path: path)
      status_data = require_hash!(data, "status", path: path)
      StatusValidator.validate!(status_data, path: child_path(path, "status"))
      if affects != "self"
        range_val = require_key!(data, "range", path: path)
        validate_float_or_range!(range_val, path: child_path(path, "range"))
      end
    end
  end
end
