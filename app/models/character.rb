# A player's character: a name, an appearance (the character builder's look, without the armor
# and weapons it can try on), and the play keys it's changed (client/src/play/keys.js). The same character plays in any world; what it has and has done in a
# world is kept per world, apart from this.
class Character < ApplicationRecord
  NAME_LENGTH = 2..16
  LOOK_BYTES = 8.kilobytes
  KEYS_BYTES = 4.kilobytes

  belongs_to :user
  has_many :world_characters, dependent: :destroy

  # Names are letters only and stored capitalized, so "aRwen" and "Arwen" are the
  # same name, and unique across every account.
  normalizes :name, with: ->(name) { name.strip.capitalize }

  validates :name, presence: true, length: {in: NAME_LENGTH}, uniqueness: true,
    format: {with: /\A\p{L}+\z/, message: "can only have letters"}
  validate :look_is_an_object
  validate :keys_are_names_to_combos
  # A name is who a character is to other players, so it's set once.
  validate :name_kept, on: :update

  private

  def name_kept
    errors.add(:name, "can't be changed") if name_changed?
  end

  def look_is_an_object
    if !look.is_a?(Hash)
      errors.add(:look, "must be an object")
    elsif look.to_json.bytesize > LOOK_BYTES
      errors.add(:look, "is too large")
    end
  end

  # The client knows the actions and their keys; this only keeps the shape and size sensible.
  def keys_are_names_to_combos
    if !keys.is_a?(Hash) || !keys.all? { |action, combo| action.is_a?(String) && combo.is_a?(String) && combo.length <= 40 }
      errors.add(:keys, "must map actions to keys")
    elsif keys.to_json.bytesize > KEYS_BYTES
      errors.add(:keys, "are too large")
    end
  end
end
