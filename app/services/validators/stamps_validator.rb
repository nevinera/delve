module Validators
  # A zone's decoration stamps (docs/schema/zone.md#stamps): sets, each one
  # image (a sheet) holding many stamps, each stamp one or more frames
  # (variants) cut from it. Placed on maps by MapValidator's stamps; the
  # game server ignores them.
  class StampsValidator < Base
    MAX_SETS = 50
    MAX_STAMPS = 500
    MAX_FRAMES = 64
    MAX_FEET_WIDTH = 1000
    MAX_NAME = 80
    KEY_RE = /\A[a-z0-9][a-z0-9_-]*\z/

    def validate!(sets, path: "$")
      reject_asset_reference!(sets, path: path)
      raise ValidationError.new("must be an object", path: path) unless sets.is_a?(Hash)
      raise ValidationError.new("has #{sets.length} sets, more than the maximum of #{MAX_SETS}", path: path) if sets.length > MAX_SETS
      sets.each do |key, set|
        validate_key!(key, path: child_path(path, key))
        validate_set!(set, path: child_path(path, key))
      end
    end

    private

    def validate_key!(key, path:)
      raise ValidationError.new("must be lowercase letters, digits, - and _", path: path) unless KEY_RE.match?(key)
    end

    def validate_set!(set, path:)
      require_object!(set, path: path)
      validate_name!(set, path: path) if given?(set, "name")
      require_non_empty_string!(set, "imageUrl", path: path)
      validate_stamps!(require_hash!(set, "stamps", path: path), path: child_path(path, "stamps"))
    end

    def validate_stamps!(stamps, path:)
      raise ValidationError.new("has #{stamps.length} stamps, more than the maximum of #{MAX_STAMPS}", path: path) if stamps.length > MAX_STAMPS
      stamps.each do |key, stamp|
        validate_key!(key, path: child_path(path, key))
        validate_stamp!(stamp, path: child_path(path, key))
      end
    end

    def validate_stamp!(stamp, path:)
      require_object!(stamp, path: path)
      validate_name!(stamp, path: path) if given?(stamp, "name")
      feet = require_numeric!(stamp, "feetWidth", path: path)
      raise ValidationError.new("feetWidth must be more than 0 and at most #{MAX_FEET_WIDTH}", path: child_path(path, "feetWidth")) unless feet > 0 && feet <= MAX_FEET_WIDTH
      validate_frames!(stamp, path: path) if given?(stamp, "frames")
    end

    def validate_frames!(stamp, path:)
      frames = require_array!(stamp, "frames", path: path, min: 1)
      list_path = child_path(path, "frames")
      raise ValidationError.new("has #{frames.length} frames, more than the maximum of #{MAX_FRAMES}", path: list_path) if frames.length > MAX_FRAMES
      frames.each_with_index { |frame, i| validate_frame!(frame, path: index_path(list_path, i)) }
    end

    def validate_frame!(frame, path:)
      require_object!(frame, path: path)
      %w[x y].each do |key|
        raise ValidationError.new("#{key} must be at least 0", path: child_path(path, key)) if require_integer!(frame, key, path: path) < 0
      end
      %w[width height].each do |key|
        raise ValidationError.new("#{key} must be positive", path: child_path(path, key)) unless require_integer!(frame, key, path: path) > 0
      end
    end

    def validate_name!(data, path:)
      name = require_string!(data, "name", path: path)
      raise ValidationError.new("must be #{MAX_NAME} characters or fewer", path: child_path(path, "name")) if name.length > MAX_NAME
    end

    def require_non_empty_string!(data, key, path:)
      value = require_string!(data, key, path: path)
      raise ValidationError.new("#{key} must not be empty", path: child_path(path, key)) if value.strip.empty?
      value
    end
  end
end
