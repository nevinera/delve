# A character in one world: the class it picked there, its level and where it is. The game server owns it,
# reading it as the character enters and writing it back as it plays (.agents/formats.md); nothing
# else sets it. The row comes with the first write, so a character that hasn't played a world has
# none, and one that has only picked a class has no position yet.
class WorldCharacter < ApplicationRecord
  belongs_to :world
  belongs_to :character

  validates :continent, presence: true, on: :position
  validates :x, :y, :z, :yaw, numericality: true, on: :position
  validates :class_id, presence: true, on: :class_pick
  validates :level, numericality: {only_integer: true, greater_than: 0}, on: :level

  def position = continent && {continent:, at: [x, y, z], yaw:}
end
