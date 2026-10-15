module Validators
  # An onTick effect of a groundArea. It has no affects/range of its own: the
  # area decides who is hit and from where.
  class AreaTickEffectValidator < Base
    TYPES = %w[harm heal resource status].freeze
    DAMAGE_SCHOOLS = %w[physical magic].freeze

    def validate!(effect, path: "$")
      require_object!(effect, path: path)
      type = require_string!(effect, "type", path: path)
      require_one_of!(type, TYPES, path: child_path(path, "type"))
      validate_tags!(effect, path: path) if given?(effect, "tags")
      send(:"validate_#{type}!", effect, path: path)
    end

    private

    def validate_harm!(effect, path:)
      validate_float_or_range!(require_key!(effect, "amount", path: path), path: child_path(path, "amount"))
      return unless given?(effect, "school")
      require_one_of!(require_string!(effect, "school", path: path), DAMAGE_SCHOOLS, path: child_path(path, "school"))
    end

    def validate_heal!(effect, path:)
      validate_float_or_range!(require_key!(effect, "amount", path: path), path: child_path(path, "amount"))
    end

    def validate_resource!(effect, path:)
      require_string!(effect, "resourceName", path: path)
      require_numeric!(effect, "delta", path: path)
    end

    def validate_status!(effect, path:)
      require_numeric!(effect, "duration", path: path)
      StatusValidator.validate!(require_hash!(effect, "status", path: path), path: child_path(path, "status"))
    end
  end
end
