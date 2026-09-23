# Replaces a CharacterClass's class_abilities with rows built from the
# "powers" of its fetched (fully resolved, $ref-free) class JSON, in order.
# The raw power is kept in source_json for anything not broken out into a
# column (effects, graphics, sounds).
class CharacterClasses::ExtractAbilities
  def self.call(...) = new(...).call

  def initialize(character_class:, data:)
    @character_class = character_class
    @data = data
  end

  def call
    ClassAbility.transaction do
      @character_class.class_abilities.delete_all
      powers.each_with_index { |power, position| @character_class.class_abilities.create!(attributes(power, position)) }
    end
  end

  private

  def powers
    @data["powers"] || []
  end

  def attributes(power, position)
    {
      position: position,
      name: power["name"],
      description: power["description"],
      icon_url: CharacterClasses::IconUrl.call(icon_url: power["iconURL"], location: @character_class.location),
      cast_time: power["castTime"],
      global_cooldown: power["globalCooldown"],
      cooldown: power["cooldown"],
      max_range: power["maxRange"],
      cost_type: power["costType"],
      cost_amount: power["costAmount"],
      source_json: power
    }
  end
end
