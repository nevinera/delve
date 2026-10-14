module Validators
  # A zone's stamps (StampsValidator), and that every stamp its maps use -
  # placed as decoration, or an interactable's look - is one of them, with
  # a variant among its frames.
  class StampReferences < Base
    def validate!(zone, path: "$")
      sets = given?(zone, "stamps") ? zone["stamps"] : {}
      StampsValidator.validate!(sets, path: child_path(path, "stamps")) if given?(zone, "stamps")
      zone["maps"].each_with_index { |map, i| validate_map!(sets, map, path: index_path(child_path(path, "maps"), i)) }
    end

    private

    def validate_map!(sets, map, path:)
      (map["stamps"] || []).each_with_index do |placed, j|
        validate_use!(sets, map["identifier"], placed, %w[stamp variant], path: index_path(child_path(path, "stamps"), j))
      end
      (map["interactables"] || []).each_with_index do |interactable, j|
        validate_interactable!(sets, map["identifier"], interactable, path: index_path(child_path(path, "interactables"), j))
      end
    end

    def validate_interactable!(sets, map_id, interactable, path:)
      validate_use!(sets, map_id, interactable, %w[stamp variant], path: path)
      validate_use!(sets, map_id, interactable, %w[usedStamp usedVariant], path: path) if given?(interactable, "usedStamp")
    end

    # data[key] names a stamp the zone has, and data[variant_key] (if
    # given) one of its frames.
    def validate_use!(sets, map_id, data, (key, variant_key), path:)
      set, name = data[key].split("/", 2)
      stamp = sets.dig(set, "stamps", name)
      raise ValidationError.new("#{key} #{data[key].inspect} on map #{map_id.inspect} isn't one of the zone's stamps", path: child_path(path, key)) unless stamp
      validate_variant!(stamp, data[variant_key], path: child_path(path, variant_key))
    end

    def validate_variant!(stamp, variant, path:)
      frames = (stamp["frames"] || [nil]).length
      return unless variant.is_a?(Integer) && variant >= frames
      raise ValidationError.new("must be less than #{frames}, the stamp's frames", path: path)
    end
  end
end
