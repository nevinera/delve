module Validators
  # One quest in a world's quests file (docs/schema/quest.md). Checks shape
  # only; Validators::QuestReferences checks what it points at.
  class QuestValidator < Base
    # Short enough that "quest/completed/<identifier>" is a valid flag.
    IDENTIFIER_FORMAT = /\A[A-Za-z0-9_-]{1,54}\z/
    TIMER_FORMAT = /\A([1-9]\d*)([sm])\z/
    MAX_TIMER_SECONDS = 60 * 60
    OBJECTIVE_TYPES = %w[talk kill reach].freeze

    # The timer in seconds, or nil for a malformed one.
    def self.timer_seconds(timer)
      match = TIMER_FORMAT.match(timer.to_s) or return
      match[1].to_i * ((match[2] == "m") ? 60 : 1)
    end

    def validate!(data, path: "$")
      require_object!(data, path: path)
      validate_identifier!(data, path: path)
      %w[name chainIdentifier chainName offerText description].each { |key| require_non_empty_string!(data, key, path: path) }
      validate_texts!(data, path: path)
      require_boolean!(data, "marker", path: path) if given?(data, "marker")
      validate_ncus!(data, path: path)
      validate_flags!(data, path: path)
      validate_timer!(data, path: path) if given?(data, "timer")
      validate_objectives!(data, path: path)
      validate_rewards!(data, path: path) if given?(data, "rewards")
    end

    private

    def require_non_empty_string!(data, key, path:)
      value = require_string!(data, key, path: path)
      raise ValidationError.new("#{key} must not be empty", path: child_path(path, key)) if value.strip.empty?
      value
    end

    def validate_identifier!(data, path:)
      identifier = require_string!(data, "identifier", path: path)
      return if identifier.match?(IDENTIFIER_FORMAT)
      raise ValidationError.new("identifier must be 1-54 letters, digits, _ or -", path: child_path(path, "identifier"))
    end

    def validate_texts!(data, path:)
      %w[progressText completionText].each do |key|
        require_string!(data, key, path: path) if given?(data, key)
      end
    end

    def validate_ncus!(data, path:)
      validate_ncu_ref!(require_hash!(data, "offeredBy", path: path), path: child_path(path, "offeredBy"))
      validate_ncu_ref!(require_hash!(data, "turnIn", path: path), path: child_path(path, "turnIn")) if given?(data, "turnIn")
    end

    def validate_ncu_ref!(data, path:)
      require_non_empty_string!(data, "zone", path: path)
      require_non_empty_string!(data, "ncu", path: path)
    end

    def validate_flags!(data, path:)
      %w[requiresFlags grantsFlags].each do |key|
        next unless given?(data, key)
        require_array!(data, key, path: path).each_with_index do |flag, i|
          validate_flag!(flag, key, path: index_path(child_path(path, key), i))
        end
      end
    end

    def validate_flag!(flag, key, path:)
      raise ValidationError.new("must be a valid flag (type/identifier)", path: path) unless CharacterFlag.valid_flag?(flag)
      return unless key == "grantsFlags" && flag.start_with?("quest/")
      raise ValidationError.new("quest flags are only granted by completing quests", path: path)
    end

    def validate_timer!(data, path:)
      seconds = self.class.timer_seconds(data["timer"])
      return if seconds && seconds <= MAX_TIMER_SECONDS
      raise ValidationError.new("timer must be like \"90s\" or \"5m\", at most 60m", path: child_path(path, "timer"))
    end

    def validate_objectives!(data, path:)
      objectives = given?(data, "objectives") ? require_array!(data, "objectives", path: path) : []
      if objectives.empty? && !given?(data, "turnIn")
        raise ValidationError.new("a quest needs at least one objective or a turnIn", path: path)
      end
      objectives_path = child_path(path, "objectives")
      objectives.each_with_index { |objective, i| validate_objective!(objective, path: index_path(objectives_path, i)) }
      validate_distinct_objectives!(objectives, path: objectives_path)
    end

    def validate_objective!(data, path:)
      require_object!(data, path: path)
      require_one_of!(data["type"], OBJECTIVE_TYPES, path: child_path(path, "type"))
      %w[zone text].each { |key| require_non_empty_string!(data, key, path: path) }
      require_non_empty_string!(data, "map", path: path) if given?(data, "map")
      case data["type"]
      when "talk" then require_non_empty_string!(data, "ncu", path: path)
      when "kill" then validate_kill!(data, path: path)
      end
    end

    def validate_kill!(data, path:)
      unless given?(data, "unit") ^ given?(data, "unitType")
        raise ValidationError.new("exactly one of unit or unitType is required", path: path)
      end
      %w[unit unitType].each { |key| require_non_empty_string!(data, key, path: path) if given?(data, key) }
      return unless given?(data, "count")
      count = require_integer!(data, "count", path: path)
      raise ValidationError.new("count must be at least 1", path: child_path(path, "count")) if count < 1
    end

    # Progress is tracked by an objective's content (its hash, which leaves
    # out its text), so two objectives with the same content would share it.
    def validate_distinct_objectives!(objectives, path:)
      hashes = objectives.map { |objective| QuestObjective.hash_of(objective) }
      hashes.each_with_index do |hash, i|
        next unless hashes.first(i).include?(hash)
        raise ValidationError.new("duplicates an earlier objective", path: index_path(path, i))
      end
    end

    def validate_rewards!(data, path:)
      require_array!(data, "rewards", path: path).each_with_index do |reward, i|
        reward_path = index_path(child_path(path, "rewards"), i)
        require_object!(reward, path: reward_path)
        require_non_empty_string!(reward, "zone", path: reward_path)
        require_non_empty_string!(reward, "item", path: reward_path)
      end
    end
  end
end
