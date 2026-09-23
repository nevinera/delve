module Validators
  class StatusEffectValidator < Base
    TYPE_OPTIONS = %w[stat recurring none].freeze
    CONDITION_TYPE_OPTIONS = %w[hasStatus selfHealthPct targetHealthPct casterResource].freeze
    COMPARISON_OPTIONS = %w[above below].freeze

    # Tier 1: input stats - the same raw pools UnitCombatStats/
    # unitEffectiveStats sum from equipped items. "add" is flat rating
    # points, "multiply" is a fraction of the current value.
    INPUT_STAT_NAMES = %w[
      strength agility intellect stamina
      critRating hasteRating masteryRating versatilityRating defenceRating
    ].freeze

    # Tier 2: derived/output figures - computed by running Tier 1 through
    # the existing formulas. "add" is flat percentage points (or a flat
    # value for maxHealth/movementSpeed), "multiply" is a scalar on the
    # already-computed result.
    OUTPUT_STAT_NAMES = %w[
      physicalCritChance magicCritChance
      physicalHaste magicHaste
      physicalAvoidance magicAvoidance
      physicalMitigation magicMitigation
      masteryValue maxHealth movementSpeed attackSpeed
      damageDone physicalDamageDone magicDamageDone
      healingDone healingTaken
      damageTaken physicalDamageTaken magicDamageTaken
    ].freeze

    STAT_NAMES = (INPUT_STAT_NAMES + OUTPUT_STAT_NAMES).freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      type = require_string!(data, "type", path: path)
      require_one_of!(type, TYPE_OPTIONS, path: child_path(path, "type"))

      case type
      when "stat" then validate_stat!(data, path: path)
      when "recurring" then validate_recurring!(data, path: path)
      end
      validate_condition!(data, path: path) if given?(data, "condition")
    end

    private

    def validate_stat!(data, path:)
      stat_name = require_string!(data, "statName", path: path)
      require_one_of!(stat_name, STAT_NAMES, path: child_path(path, "statName"))
      modifier_type = require_string!(data, "modifierType", path: path)
      require_one_of!(modifier_type, %w[multiply add], path: child_path(path, "modifierType"))
      require_numeric!(data, "amount", path: path)
    end

    def validate_recurring!(data, path:)
      require_numeric!(data, "tickRate", path: path)
      on_tick = require_string!(data, "onTick", path: path)
      require_one_of!(on_tick, %w[heal harm], path: child_path(path, "onTick"))
      require_numeric!(data, "amount", path: path)
      validate_school!(data, path: path) if given?(data, "school")
    end

    def validate_school!(data, path:)
      school = require_string!(data, "school", path: path)
      require_one_of!(school, PowerEffectValidator::DAMAGE_SCHOOLS, path: child_path(path, "school"))
    end

    def validate_condition!(data, path:)
      condition = require_hash!(data, "condition", path: path)
      condition_path = child_path(path, "condition")
      type = require_string!(condition, "type", path: condition_path)
      require_one_of!(type, CONDITION_TYPE_OPTIONS, path: child_path(condition_path, "type"))
      case type
      when "hasStatus" then validate_has_status_condition!(condition, path: condition_path)
      when "selfHealthPct", "targetHealthPct" then validate_health_pct_condition!(condition, path: condition_path)
      when "casterResource" then validate_caster_resource_condition!(condition, path: condition_path)
      end
    end

    def validate_has_status_condition!(data, path:)
      require_string!(data, "statusName", path: path)
    end

    def validate_health_pct_condition!(data, path:)
      validate_comparison!(data, path: path)
      threshold = require_numeric!(data, "threshold", path: path)
      return if threshold.between?(0, 100)
      raise ValidationError.new("threshold must be between 0 and 100", path: child_path(path, "threshold"))
    end

    def validate_caster_resource_condition!(data, path:)
      require_string!(data, "resourceName", path: path)
      validate_comparison!(data, path: path)
      require_numeric!(data, "threshold", path: path)
    end

    def validate_comparison!(data, path:)
      comparison = require_string!(data, "comparison", path: path)
      require_one_of!(comparison, COMPARISON_OPTIONS, path: child_path(path, "comparison"))
    end
  end
end
