# Moves a character whose class version has expired onto the newest
# available version of that class, so they can still join a zone. Keeps
# them on it if there's no newer one.
class CharacterClasses::UpgradeExpired
  def self.call(...) = new(...).call

  def initialize(character:)
    @character = character
  end

  def call
    current = @character.character_class
    return unless current.expired?

    latest = CharacterClass.newest(CharacterClass.available.where(identifier: current.identifier))
    # update_columns: joining is when the game server takes the class, so
    # Character's no-change-while-in-a-zone rule doesn't apply.
    @character.update_columns(character_class_id: latest.id) if latest
    @character.reset_character_class
  end
end
