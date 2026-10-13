module Validators
  # A zone's decoration stamps (StampsValidator), and that every stamp
  # placed on its maps is one of them, with a variant among its frames.
  class StampReferences < Base
    def validate!(zone, path: "$")
      sets = given?(zone, "stamps") ? zone["stamps"] : {}
      StampsValidator.validate!(sets, path: child_path(path, "stamps")) if given?(zone, "stamps")
      zone["maps"].each_with_index { |map, i| validate_map!(sets, map, path: index_path(child_path(path, "maps"), i)) }
    end

    private

    def validate_map!(sets, map, path:)
      (map["stamps"] || []).each_with_index do |placed, j|
        validate_placed!(sets, map["identifier"], placed, path: index_path(child_path(path, "stamps"), j))
      end
    end

    def validate_placed!(sets, map_id, placed, path:)
      set, key = placed["stamp"].split("/", 2)
      stamp = sets.dig(set, "stamps", key)
      raise ValidationError.new("stamp #{placed["stamp"].inspect} on map #{map_id.inspect} isn't one of the zone's stamps", path: child_path(path, "stamp")) unless stamp
      validate_variant!(stamp, placed["variant"], path: path)
    end

    def validate_variant!(stamp, variant, path:)
      frames = (stamp["frames"] || [nil]).length
      return unless variant.is_a?(Integer) && variant >= frames
      raise ValidationError.new("variant must be less than #{frames}, the stamp's frames", path: child_path(path, "variant"))
    end
  end
end
