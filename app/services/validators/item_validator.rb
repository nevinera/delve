module Validators
  class ItemValidator < Base
    SLOT_VALUES = %w[
      head neck shoulders back chest wrists hands waist legs feet
      ring main_hand off_hand one_hand two_hand
    ].freeze

    WEAPON_SLOTS = %w[main_hand off_hand one_hand two_hand].freeze

    WEAPON_TYPES = %w[
      axe sword mace dagger fist_weapon polearm staff bow crossbow gun wand thrown
    ].freeze

    PRIMARY_VALUES = %w[strength agility intellect].freeze

    SECONDARY_VALUES = %w[
      stamina crit_rating haste_rating mastery_rating versatility_rating
      defence_rating recovery_rating
    ].freeze

    # Max secondaries per slot, per docs/stats.md's Slots table.
    TWO_SECONDARY_SLOTS = %w[ring shoulders back waist hands feet wrists].freeze
    THREE_SECONDARY_SLOTS = %w[neck head chest legs main_hand off_hand one_hand two_hand].freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      require_string!(data, "identifier", path: path)
      require_string!(data, "name", path: path)
      slot = validate_slot!(data, path: path)
      validate_elvl!(data, path: path)
      shield = validate_shield!(data, slot, path: path)
      validate_weapon_type!(data, slot, shield, path: path)
      validate_primary!(data, slot, shield, path: path)
      validate_secondaries!(data, slot, path: path) if data.key?("secondaries")
      validate_optional_strings!(data, path: path)
    end

    private

    def validate_slot!(data, path:)
      slot = require_string!(data, "slot", path: path)
      require_one_of!(slot, SLOT_VALUES, path: child_path(path, "slot"))
      slot
    end

    def validate_optional_strings!(data, path:)
      require_string!(data, "description", path: path) if data.key?("description")
      require_string!(data, "icon_url", path: path) if data.key?("icon_url")
    end

    def validate_elvl!(data, path:)
      elvl = require_integer!(data, "elvl", path: path)
      raise ValidationError.new("elvl must be at least 0", path: child_path(path, "elvl")) if elvl < 0
    end

    def validate_shield!(data, slot, path:)
      return false unless data.key?("shield")
      shield = data["shield"]
      unless shield == true || shield == false
        raise ValidationError.new("shield must be a boolean", path: child_path(path, "shield"))
      end
      if shield && slot != "off_hand"
        raise ValidationError.new("shield is only valid when slot is off_hand", path: child_path(path, "shield"))
      end
      shield
    end

    def validate_weapon_type!(data, slot, shield, path:)
      weapon_type_path = child_path(path, "weaponType")
      value = data["weaponType"]
      return validate_weapon_type_forbidden!(value, path: weapon_type_path) unless WEAPON_SLOTS.include?(slot) && !shield
      return validate_weapon_type_value!(value, path: weapon_type_path) unless value.nil?
      return if slot == "off_hand"
      raise ValidationError.new("weaponType is required for slot #{slot.inspect}", path: weapon_type_path)
    end

    def validate_weapon_type_forbidden!(value, path:)
      return if value.nil?
      raise ValidationError.new("weaponType must be null for this slot", path: path)
    end

    def validate_weapon_type_value!(value, path:)
      return if WEAPON_TYPES.include?(value)
      raise ValidationError.new("weaponType must be one of: #{WEAPON_TYPES.join(", ")}", path: path)
    end

    def validate_primary!(data, slot, shield, path:)
      return unless data.key?("primary")
      primary = data["primary"]
      return validate_no_primary!(primary, path: path) if slot == "ring" || slot == "neck" || shield
      return if primary.nil?
      raise ValidationError.new("primary must be one of: #{PRIMARY_VALUES.join(", ")}, or null", path: child_path(path, "primary")) unless PRIMARY_VALUES.include?(primary)
    end

    def validate_no_primary!(primary, path:)
      return if primary.nil?
      raise ValidationError.new("primary must be null for this slot", path: child_path(path, "primary"))
    end

    def validate_secondaries!(data, slot, path:)
      secondaries = data["secondaries"]
      secondaries_path = child_path(path, "secondaries")
      raise ValidationError.new("secondaries must be an array", path: secondaries_path) unless secondaries.is_a?(Array)
      validate_secondaries_count!(secondaries, slot, path: secondaries_path)
      secondaries.each_with_index do |value, i|
        validate_secondary_value!(value, path: index_path(secondaries_path, i))
      end
    end

    def validate_secondaries_count!(secondaries, slot, path:)
      max = max_secondaries(slot)
      return if secondaries.length <= max
      raise ValidationError.new("has at most #{max} entries for slot #{slot.inspect}", path: path)
    end

    def validate_secondary_value!(value, path:)
      return if SECONDARY_VALUES.include?(value)
      raise ValidationError.new("must be one of: #{SECONDARY_VALUES.join(", ")}", path: path)
    end

    def max_secondaries(slot)
      return 2 if TWO_SECONDARY_SLOTS.include?(slot)
      return 3 if THREE_SECONDARY_SLOTS.include?(slot)
      3
    end
  end
end
