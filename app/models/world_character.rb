# A character in one world: the class it picked there, its level, where it is and the id of the
# rest point it made its home. The game server owns it, reading it as the character enters and
# writing it back as it plays (.agents/formats.md); nothing else sets it. The row comes with the
# first write, so a character that hasn't played a world has none, and one that has only picked a
# class has no position yet.
class WorldCharacter < ApplicationRecord
  belongs_to :world
  belongs_to :character

  validates :continent, presence: true, on: :position
  validates :x, :y, :z, :yaw, numericality: true, on: :position
  validates :class_id, presence: true, on: :class_pick
  validates :level, numericality: {only_integer: true, greater_than: 0}, on: :level

  def position = continent && {continent:, at: [x, y, z], yaw:}

  RECENT_WORLDS = 4

  # For each character, by id, the released worlds it played most lately, up to RECENT_WORLDS. The
  # game server writes a character's row in a world as it plays there.
  def self.recent_worlds(characters)
    rows = where(character: characters).includes(:world).order(updated_at: :desc)
    rows.select { |row| row.world.released? }.group_by(&:character_id).transform_values { |list| list.first(RECENT_WORLDS).map(&:world) }
  end
end
