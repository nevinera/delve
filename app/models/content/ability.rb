module Content
  class Ability
    include ActiveModel::Model
    include ActiveModel::Attributes

    attribute :name, :string
    attribute :description, :string
    attribute :icon_url, :string
    attribute :cast_time, :float
    attribute :global_cooldown, :float
    attribute :cooldown, :float
    attribute :max_range, :float
    attribute :speed, :float
    attribute :tags, default: -> { [] }
    attribute :graphic_effects, default: -> { [] }
    attribute :sound_effects, default: -> { [] }
    attribute :effects, default: -> { [] }

    validates :name, presence: true
    validates :global_cooldown, presence: true, numericality: true

    def self.from_h(hash)
      new(
        scalar_attributes_from_h(hash).merge(
          graphic_effects: build_all(GraphicEffect, hash["graphicEffects"]),
          sound_effects: build_all(SoundEffect, hash["soundEffects"]),
          effects: build_all(Effect, hash["effects"])
        )
      )
    end

    def self.scalar_attributes_from_h(hash)
      {
        name: hash["name"],
        description: hash["description"],
        icon_url: hash["iconURL"],
        cast_time: hash["castTime"],
        global_cooldown: hash["globalCooldown"],
        cooldown: hash["cooldown"],
        max_range: hash["maxRange"],
        speed: hash["speed"],
        tags: hash["tags"] || []
      }
    end

    def self.build_all(klass, entries)
      (entries || []).map { |entry| klass.from_h(entry) }
    end

    def to_h
      {
        "name" => name,
        "iconURL" => icon_url,
        "castTime" => cast_time,
        "globalCooldown" => global_cooldown
      }.merge(optional_fields).merge(
        "graphicEffects" => graphic_effects.map(&:to_h),
        "soundEffects" => sound_effects.map(&:to_h),
        "effects" => effects.map(&:to_h)
      )
    end

    private

    def optional_fields
      {"description" => description, "cooldown" => cooldown, "maxRange" => max_range, "speed" => speed, "tags" => tags.presence}.compact
    end
  end
end
