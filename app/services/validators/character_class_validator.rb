module Validators
  class CharacterClassValidator < Base
    MAX_RESOURCES = 3
    MAX_STAT_PRIORITIES = 3
    STAT_PRIORITY_NAMES = %w[dps hybrid tank healing].freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      require_string!(data, "name", path: path)
      validate_description!(data, path: path) if given?(data, "description")
      validate_colors!(require_hash!(data, "colors", path: path), path: child_path(path, "colors"))
      validate_resources!(data, path: path)
      validate_abilities!(data, path: path)
      validate_primary_stats!(data, path: path)
      validate_stat_priorities!(data, path: path)
      validate_wields!(data, path: path)
    end

    private

    def validate_abilities!(data, path:)
      validate_powers!(data, path: path) if given?(data, "powers")
      validate_passives!(data, path: path) if given?(data, "passives")
    end

    def validate_description!(data, path:)
      desc = data["description"]
      raise ValidationError.new("description must be a string", path: child_path(path, "description")) unless desc.is_a?(String)
    end

    def validate_colors!(data, path:)
      require_object!(data, path: path)
      validate_hex_color!(data, "major", path: path)
      validate_hex_color!(data, "minor", path: path)
    end

    def validate_resources!(data, path:)
      resources_path = child_path(path, "resources")
      resources = require_array!(data, "resources", path: path, min: 1)
      if resources.length > MAX_RESOURCES
        raise ValidationError.new("resources may not exceed #{MAX_RESOURCES} entries", path: resources_path)
      end
      resources.each_with_index do |resource, i|
        ResourceTypeValidator.validate!(resource, path: index_path(resources_path, i))
      end
      validate_one_primary_resource!(resources, path: resources_path)
    end

    def validate_one_primary_resource!(resources, path:)
      primary_count = resources.count { |r| r.is_a?(Hash) && r["displayType"] == "primary" }
      return if primary_count == 1
      raise ValidationError.new("exactly one resource must set displayType: \"primary\"", path: path)
    end

    def validate_powers!(data, path:)
      powers = data["powers"]
      raise ValidationError.new("powers must be an array", path: child_path(path, "powers")) unless powers.is_a?(Array)
      if powers.length > 10
        raise ValidationError.new("powers may not exceed 10 entries", path: child_path(path, "powers"))
      end
      powers.each_with_index do |power, i|
        AbilityValidator.validate!(power, path: index_path(child_path(path, "powers"), i))
      end
    end

    # Passives are hidden, permanent buffs (see docs/schema/character_class.md)
    # - each must be a valid Status set to treatAs: "inherent", since that's
    # the only treatAs the client's StatusBar renders nothing for (App.jsx's
    # StatusBar only shows "buff"/"debuff"). Capped at 6, matching
    # docs/classes-and-abilities.md's "six passive ones".
    MAX_PASSIVES = 6

    def validate_passives!(data, path:)
      passives_path = child_path(path, "passives")
      passives = data["passives"]
      raise ValidationError.new("passives must be an array", path: passives_path) unless passives.is_a?(Array)
      if passives.length > MAX_PASSIVES
        raise ValidationError.new("passives may not exceed #{MAX_PASSIVES} entries", path: passives_path)
      end
      passives.each_with_index do |passive, i|
        validate_passive!(passive, path: index_path(passives_path, i))
      end
      validate_passive_names_unique!(passives, path: passives_path)
    end

    def validate_passive!(data, path:)
      StatusValidator.validate!(data, path: path)
      return unless data.is_a?(Hash) && data["treatAs"] != "inherent"
      raise ValidationError.new("passives must set treatAs: \"inherent\" to stay hidden", path: child_path(path, "treatAs"))
    end

    def validate_passive_names_unique!(passives, path:)
      names = passives.filter_map { |p| p["name"] if p.is_a?(Hash) }
      return if names.uniq.length == names.length
      raise ValidationError.new("passives must not contain duplicate names", path: path)
    end

    def validate_primary_stats!(data, path:)
      stats_path = child_path(path, "primaryStats")
      stats = data["primaryStats"]
      raise ValidationError.new("primaryStats must be an array", path: stats_path) unless stats.is_a?(Array)
      validate_primary_stats_content!(stats, path: stats_path)
    end

    def validate_primary_stats_content!(stats, path:)
      if stats.empty?
        raise ValidationError.new("primaryStats must contain at least 1 entry", path: path)
      end
      if stats.uniq.length != stats.length
        raise ValidationError.new("primaryStats must not contain duplicates", path: path)
      end
      invalid = stats - CharacterItem::PRIMARY_STATS
      if invalid.any?
        raise ValidationError.new("primaryStats contains unrecognized values: #{invalid.join(", ")}", path: path)
      end
    end

    def validate_stat_priorities!(data, path:)
      priorities_path = child_path(path, "statPriorities")
      priorities = data["statPriorities"]
      raise ValidationError.new("statPriorities must be an array", path: priorities_path) unless priorities.is_a?(Array)
      unless priorities.length.between?(1, MAX_STAT_PRIORITIES)
        raise ValidationError.new("statPriorities must contain 1 to #{MAX_STAT_PRIORITIES} entries", path: priorities_path)
      end
      priorities.each_with_index { |priority, i| validate_stat_priority!(priority, path: index_path(priorities_path, i)) }
      validate_stat_priority_names_unique!(priorities, path: priorities_path)
    end

    def validate_stat_priority!(priority, path:)
      raise ValidationError.new("statPriorities entry must be an object", path: path) unless priority.is_a?(Hash)
      validate_stat_priority_name!(priority["name"], path: child_path(path, "name"))
      stats_path = child_path(path, "secondaryStats")
      stats = priority["secondaryStats"]
      raise ValidationError.new("secondaryStats must be an array", path: stats_path) unless stats.is_a?(Array)
      validate_secondary_stats_content!(stats, path: stats_path)
    end

    def validate_stat_priority_name!(name, path:)
      return if STAT_PRIORITY_NAMES.include?(name)
      raise ValidationError.new("statPriorities name must be one of #{STAT_PRIORITY_NAMES.join(", ")}", path: path)
    end

    def validate_stat_priority_names_unique!(priorities, path:)
      names = priorities.map { |priority| priority["name"] }
      raise ValidationError.new("statPriorities names must be unique", path: path) if names.uniq.length != names.length
    end

    def validate_secondary_stats_content!(stats, path:)
      if stats.length != 5
        raise ValidationError.new("secondaryStats must contain exactly 5 entries", path: path)
      end
      if stats.uniq.length != stats.length
        raise ValidationError.new("secondaryStats must not contain duplicates", path: path)
      end
      invalid = stats - CharacterItem::SECONDARY_STATS
      if invalid.any?
        raise ValidationError.new("secondaryStats contains unrecognized values: #{invalid.join(", ")}", path: path)
      end
    end

    def validate_wields!(data, path:)
      wields_path = child_path(path, "wields")
      wields = data["wields"]
      raise ValidationError.new("wields must be an array", path: wields_path) unless wields.is_a?(Array)
      validate_wields_content!(wields, path: wields_path)
    end

    def validate_wields_content!(wields, path:)
      unless (1..2).cover?(wields.length)
        raise ValidationError.new("wields must contain 1-2 entries", path: path)
      end
      invalid = wields - CharacterClass::WIELD_TYPES
      if invalid.any?
        raise ValidationError.new("wields contains unrecognized values: #{invalid.join(", ")}", path: path)
      end
    end
  end
end
