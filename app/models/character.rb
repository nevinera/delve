# A player's character: a name and an appearance (the character builder's look, without the armor
# and weapons it can try on). The same character plays in any world; what it has and has done in a
# world is kept per world, apart from this.
class Character < ApplicationRecord
  NAME_LENGTH = 2..16
  LOOK_BYTES = 8.kilobytes

  belongs_to :user
  has_many :world_characters, dependent: :destroy

  # Names are letters only and stored capitalized, so "aRwen" and "Arwen" are the
  # same name, and unique across every account.
  normalizes :name, with: ->(name) { name.strip.capitalize }

  validates :name, presence: true, length: {in: NAME_LENGTH}, uniqueness: true,
    format: {with: /\A\p{L}+\z/, message: "can only have letters"}
  validate :look_is_an_object

  private

  def look_is_an_object
    if !look.is_a?(Hash)
      errors.add(:look, "must be an object")
    elsif look.to_json.bytesize > LOOK_BYTES
      errors.add(:look, "is too large")
    end
  end
end
