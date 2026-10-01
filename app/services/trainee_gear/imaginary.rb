# Trainee Gear that's never saved: the equipped items a character plays
# with when trying a zone directly (see Build::ZonePlaysController), at the
# elvl being tested. Same shape as EquippedItems::ForWorldCharacter.
module TraineeGear
  class Imaginary
    def self.call(...) = new(...).call

    def initialize(character_class:, elvl:)
      @character_class = character_class
      @elvl = elvl
    end

    def call
      generated.to_h do |equipped_slot, item|
        [equipped_slot, EquippedItems.item_json(CharacterItem.new(TraineeGear.item_attrs(equipped_slot, item, elvl: @elvl)))]
      end
    end

    private

    def generated
      TraineeGear::Generate.call(
        primary_stats: @character_class.primary_stats,
        secondary_stats: @character_class.secondary_stats,
        wields: @character_class.wields
      )
    end
  end
end
