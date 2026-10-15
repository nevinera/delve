module Validators
  class PowerEffectValidator < Base
    TYPE_OPTIONS = %w[harm heal resource status groundArea].freeze
    AFFECTS_OPTIONS = %w[bTarget gTarget bAll gAll self].freeze
    HARM_AFFECTS_OPTIONS = %w[bTarget gTarget bAll gAll].freeze
    DAMAGE_SCHOOLS = %w[physical magic].freeze
    # A radius splashes around the target, so it needs one.
    RADIUS_AFFECTS_OPTIONS = %w[bTarget gTarget].freeze
    GROUND_AREA_AFFECTS_OPTIONS = %w[bAll gAll all].freeze
    TICK_EFFECT_TYPES = %w[harm heal resource status].freeze
    SHAPE_TYPES = %w[circle ring line cone].freeze
    SHAPE_ANCHORS = %w[self target].freeze
    SHAPE_DIRECTIONS = %w[target facing].freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      type = require_string!(data, "type", path: path)
      require_one_of!(type, TYPE_OPTIONS, path: child_path(path, "type"))
      validate_tags!(data, path: path) if given?(data, "tags")

      case type
      when "harm" then validate_harm!(data, path: path)
      when "heal" then validate_heal!(data, path: path)
      when "resource" then validate_resource!(data, path: path)
      when "status" then validate_status!(data, path: path)
      when "groundArea" then validate_ground_area!(data, path: path)
      end
      validate_radius!(data, path: path) if given?(data, "radius")
    end

    private

    def validate_ground_area!(data, path:)
      affects = require_string!(data, "affects", path: path)
      require_one_of!(affects, GROUND_AREA_AFFECTS_OPTIONS, path: child_path(path, "affects"))
      duration = require_numeric!(data, "duration", path: path)
      raise ValidationError.new("duration must be greater than 0", path: child_path(path, "duration")) unless duration.positive?
      if given?(data, "tickInterval")
        interval = require_numeric!(data, "tickInterval", path: path)
        raise ValidationError.new("tickInterval must be greater than 0", path: child_path(path, "tickInterval")) unless interval.positive?
      end
      shape = require_hash!(data, "shape", path: path)
      validate_shape!(shape, path: child_path(path, "shape"))
      if shape_needs_target?(shape)
        validate_float_or_range!(require_key!(data, "range", path: path), path: child_path(path, "range"))
      end
      validate_tick_effects!(data, path: path)
      validate_ground_graphic!(require_hash!(data, "graphic", path: path), path: child_path(path, "graphic")) if given?(data, "graphic")
    end

    def shape_needs_target?(shape)
      shape["at"] == "target" || (%w[line cone].include?(shape["type"]) && shape["direction"] == "target")
    end

    def validate_shape!(shape, path:)
      type = require_string!(shape, "type", path: path)
      require_one_of!(type, SHAPE_TYPES, path: child_path(path, "type"))
      case type
      when "circle"
        validate_shape_anchor!(shape, path: path)
        positive!(shape, "radius", path: path)
      when "ring"
        validate_shape_anchor!(shape, path: path)
        inner = require_numeric!(shape, "innerRadius", path: path)
        raise ValidationError.new("innerRadius must be 0 or more", path: child_path(path, "innerRadius")) if inner.negative?
        outer = require_numeric!(shape, "outerRadius", path: path)
        raise ValidationError.new("outerRadius must be greater than innerRadius", path: child_path(path, "outerRadius")) unless outer > inner
      when "line", "cone"
        validate_shape_direction!(shape, path: path)
        positive!(shape, "length", path: path)
        positive!(shape, "width", path: path)
        if type == "cone" && given?(shape, "offset")
          offset = require_numeric!(shape, "offset", path: path)
          raise ValidationError.new("offset must be 0 or more", path: child_path(path, "offset")) if offset.negative?
        end
      end
    end

    def validate_shape_anchor!(shape, path:)
      require_one_of!(require_string!(shape, "at", path: path), SHAPE_ANCHORS, path: child_path(path, "at"))
    end

    def validate_shape_direction!(shape, path:)
      return unless given?(shape, "direction")
      require_one_of!(require_string!(shape, "direction", path: path), SHAPE_DIRECTIONS, path: child_path(path, "direction"))
    end

    def positive!(data, key, path:)
      value = require_numeric!(data, key, path: path)
      raise ValidationError.new("#{key} must be greater than 0", path: child_path(path, key)) unless value.positive?
    end

    def validate_tick_effects!(data, path:)
      effects_path = child_path(path, "onTick")
      effects = require_array!(data, "onTick", path: path, min: 1)
      effects.each_with_index { |effect, i| validate_tick_effect!(effect, path: index_path(effects_path, i)) }
    end

    # An onTick effect has no affects/range of its own: the area decides who
    # is hit and from where.
    def validate_tick_effect!(effect, path:)
      require_object!(effect, path: path)
      type = require_string!(effect, "type", path: path)
      require_one_of!(type, TICK_EFFECT_TYPES, path: child_path(path, "type"))
      validate_tags!(effect, path: path) if given?(effect, "tags")
      case type
      when "harm"
        validate_float_or_range!(require_key!(effect, "amount", path: path), path: child_path(path, "amount"))
        validate_school!(effect, path: path) if given?(effect, "school")
      when "heal"
        validate_float_or_range!(require_key!(effect, "amount", path: path), path: child_path(path, "amount"))
      when "resource"
        require_string!(effect, "resourceName", path: path)
        require_numeric!(effect, "delta", path: path)
      when "status"
        require_numeric!(effect, "duration", path: path)
        StatusValidator.validate!(require_hash!(effect, "status", path: path), path: child_path(path, "status"))
      end
    end

    def validate_ground_graphic!(graphic, path:)
      validate_hex_color!(graphic, "color", path: path) if given?(graphic, "color")
      if given?(graphic, "textureURL")
        url = require_string!(graphic, "textureURL", path: path)
        validate_stock_reference!(url, Content::StockAssets::GRAPHICS.keys, path: child_path(path, "textureURL")) if stock_reference?(url)
      end
      positive!(graphic, "textureScale", path: path) if given?(graphic, "textureScale")
      return unless given?(graphic, "opacity")
      opacity = require_numeric!(graphic, "opacity", path: path)
      return if opacity.between?(0, 1)
      raise ValidationError.new("opacity must be between 0 and 1", path: child_path(path, "opacity"))
    end

    def validate_harm!(data, path:)
      affects = require_string!(data, "affects", path: path)
      require_one_of!(affects, HARM_AFFECTS_OPTIONS, path: child_path(path, "affects"))
      amount = require_key!(data, "amount", path: path)
      validate_float_or_range!(amount, path: child_path(path, "amount"))
      range_val = require_key!(data, "range", path: path)
      validate_float_or_range!(range_val, path: child_path(path, "range"))
      validate_school!(data, path: path) if given?(data, "school")
    end

    def validate_radius!(data, path:)
      radius = require_numeric!(data, "radius", path: path)
      raise ValidationError.new("radius must be greater than 0", path: child_path(path, "radius")) unless radius.positive?
      return if RADIUS_AFFECTS_OPTIONS.include?(data["affects"])
      raise ValidationError.new("radius only applies to bTarget and gTarget effects", path: child_path(path, "radius"))
    end

    def validate_school!(data, path:)
      school = require_string!(data, "school", path: path)
      require_one_of!(school, DAMAGE_SCHOOLS, path: child_path(path, "school"))
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
