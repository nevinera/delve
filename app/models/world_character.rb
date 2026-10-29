# A character in one world: where it is there. The game server owns it, reading it as the
# character enters and writing it back as it plays (docs/formats/game-protocol.md); nothing else
# sets it. The row comes with the first write, so a character that hasn't played a world has none.
class WorldCharacter < ApplicationRecord
  belongs_to :world
  belongs_to :character

  validates :continent, presence: true
  validates :x, :y, :z, :yaw, numericality: true

  def position = {continent:, at: [x, y, z], yaw:}
end
