module Validators
  class CharacterClassValidator < Base
    HEX_COLOR_RE = /\A[0-9a-fA-F]{6}\z/

    def validate!(data, path: "$")
      require_object!(data, path: path)
      require_string!(data, "name", path: path)
      validate_description!(data, path: path) if data.key?("description")
      validate_colors!(require_hash!(data, "colors", path: path), path: child_path(path, "colors"))
      validate_resources!(data, path: path) if data.key?("resources")
      validate_powers!(data, path: path) if data.key?("powers")
      validate_primary_stats!(data, path: path)
      validate_secondary_stats!(data, path: path)
    end

    private

    def validate_description!(data, path:)
      desc = data["description"]
      raise ValidationError.new("description must be a string", path: child_path(path, "description")) unless desc.is_a?(String)
    end

    def validate_colors!(data, path:)
      require_object!(data, path: path)
      validate_color!(data, "major", path: path)
      validate_color!(data, "minor", path: path)
    end

    def validate_color!(data, key, path:)
      color = require_string!(data, key, path: path)
      return if HEX_COLOR_RE.match?(color)
      raise ValidationError.new("#{key} must be a 6-digit hex string without #", path: child_path(path, key))
    end

    def validate_resources!(data, path:)
      resources = data["resources"]
      raise ValidationError.new("resources must be an array", path: child_path(path, "resources")) unless resources.is_a?(Array)
      resources.each_with_index do |resource, i|
        ResourceTypeValidator.validate!(resource, path: index_path(child_path(path, "resources"), i))
      end
    end

    def validate_powers!(data, path:)
      powers = data["powers"]
      raise ValidationError.new("powers must be an array", path: child_path(path, "powers")) unless powers.is_a?(Array)
      if powers.length > 12
        raise ValidationError.new("powers may not exceed 12 entries", path: child_path(path, "powers"))
      end
      powers.each_with_index do |power, i|
        PowerValidator.validate!(power, path: index_path(child_path(path, "powers"), i))
      end
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

    def validate_secondary_stats!(data, path:)
      stats_path = child_path(path, "secondaryStats")
      stats = data["secondaryStats"]
      raise ValidationError.new("secondaryStats must be an array", path: stats_path) unless stats.is_a?(Array)
      validate_secondary_stats_content!(stats, path: stats_path)
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
  end
end
