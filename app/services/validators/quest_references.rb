module Validators
  # Cross-checks a world's quests against its zones: every NCU, unit, unit
  # type, map and item a quest names must exist in the named zone (and an
  # objective's NCU or unit on its map, when it names one). Run after
  # QuestsValidator and each zone's ZoneValidator have passed.
  class QuestReferences
    include Helpers

    def self.validate!(quests, zones_by_key)
      new(quests, zones_by_key).validate!
    end

    def initialize(quests, zones_by_key)
      @quests = quests
      @zones_by_key = zones_by_key
    end

    def validate!
      @quests.each_with_index do |quest, i|
        quest_path = index_path("$", i)
        validate_ncu!(quest["offeredBy"], path: child_path(quest_path, "offeredBy"))
        validate_ncu!(quest["turnIn"], path: child_path(quest_path, "turnIn")) if quest["turnIn"]
        validate_objectives!(quest, path: quest_path)
        validate_rewards!(quest, path: quest_path)
      end
    end

    private

    def validate_objectives!(quest, path:)
      (quest["objectives"] || []).each_with_index do |objective, i|
        objective_path = index_path(child_path(path, "objectives"), i)
        case objective["type"]
        when "talk" then validate_ncu!(objective, path: objective_path)
        when "reach" then objective["map"] ? map(objective, path: objective_path) : zone!(objective, path: objective_path)
        when "kill" then validate_kill!(objective, path: objective_path)
        end
      end
    end

    def validate_rewards!(quest, path:)
      (quest["rewards"] || []).each_with_index do |reward, i|
        reward_path = index_path(child_path(path, "rewards"), i)
        next if (zone!(reward, path: reward_path)["items"] || {}).key?(reward["item"])
        raise missing(reward, "item", reward["item"], path: reward_path)
      end
    end

    # With a map (talk objectives only), the NCU must be on that map.
    def validate_ncu!(ref, path:)
      on_maps = ref["map"] ? [map(ref, path: path)] : maps(zone!(ref, path: path))
      return if on_maps.any? { |map| ncu_on?(map, ref["ncu"]) }
      on_map = " on map \"#{ref["map"]}\"" if ref["map"]
      raise ValidationError.new("zone \"#{ref["zone"]}\" has no NCU \"#{ref["ncu"]}\"#{on_map}", path: path)
    end

    def validate_kill!(objective, path:)
      if objective["unitType"]
        validate_unit_type!(objective, path: path)
      else
        validate_unit!(objective, path: path)
      end
    end

    def validate_unit_type!(objective, path:)
      zone = zone!(objective, path: path)
      map(objective, path: path) if objective["map"]
      return if (zone["unitTypes"] || {}).key?(objective["unitType"])
      raise missing(objective, "unit type", objective["unitType"], path: path)
    end

    # With a map, the unit must be on that map.
    def validate_unit!(objective, path:)
      on_maps = objective["map"] ? [map(objective, path: path)] : maps(zone!(objective, path: path))
      return if on_maps.any? { |map| unit_on?(map, objective["unit"]) }
      on_map = " on map \"#{objective["map"]}\"" if objective["map"]
      raise ValidationError.new("zone \"#{objective["zone"]}\" has no unit \"#{objective["unit"]}\"#{on_map}", path: path)
    end

    def ncu_on?(map, identifier) = (map["ncus"] || []).any? { |ncu| ncu["identifier"] == identifier }

    def unit_on?(map, identifier) = (map["units"] || []).any? { |unit| unit["identifier"] == identifier }

    def map(ref, path:)
      found = maps(zone!(ref, path: path)).find { |map| map["identifier"] == ref["map"] }
      found or raise missing(ref, "map", ref["map"], path: path)
    end

    def maps(zone) = zone["maps"] || []

    def zone!(ref, path:)
      @zones_by_key[ref["zone"]] or raise ValidationError.new("unknown zone \"#{ref["zone"]}\"", path: path)
    end

    def missing(ref, kind, identifier, path:)
      ValidationError.new("zone \"#{ref["zone"]}\" has no #{kind} \"#{identifier}\"", path: path)
    end
  end
end
