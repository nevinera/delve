module Content
  # Base class for a power's effect entries. Effects are polymorphic on
  # "type" (see Validators::PowerEffectValidator) - each type has a
  # different field set, so each gets its own subclass rather than one
  # class with every field optional.
  class Effect
    include ActiveModel::Model
    include ActiveModel::Attributes

    TYPE_OPTIONS = Validators::PowerEffectValidator::TYPE_OPTIONS
    AFFECTS_OPTIONS = Validators::PowerEffectValidator::AFFECTS_OPTIONS

    attribute :tags, default: -> { [] }

    validate :tags_are_valid

    def self.from_h(hash)
      subclass_for(hash["type"]).build_from_h(hash)
    end

    def self.subclass_for(type)
      {"harm" => Harm, "heal" => Heal, "resource" => Resource, "status" => Status}
        .fetch(type) { raise ArgumentError, "unknown effect type: #{type.inspect}" }
    end

    def self.type
      name.demodulize.underscore
    end

    def type
      self.class.type
    end

    def to_h
      {"type" => type, "tags" => tags.presence}.compact
    end

    private

    def tags_are_valid
      return if tags.blank?
      errors.add(:tags, "may not exceed 24 items") if tags.length > 24
      tags.each { |tag| errors.add(:tags, "must be 16 characters or fewer") if tag.to_s.length > 16 }
    end
  end
end
