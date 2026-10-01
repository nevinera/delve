class Character < ApplicationRecord
  belongs_to :user
  belongs_to :character_class
  has_one :character_setting, dependent: :destroy
  has_many :world_characters, dependent: :destroy

  validates :name, presence: true,
    uniqueness: true,
    length: {minimum: 6, maximum: 16},
    format: {with: /\A[a-zA-Z-]+\z/, message: "must contain only letters and dashes"}
  validates :token_url, presence: true,
    format: {with: /\Ahttps?:\/\/\S+\z/, message: "must be a valid URL"}

  def setting_or_default = character_setting || build_character_setting

  # When the character last entered any world.
  def last_played_at = world_characters.maximum(:last_played_at)
end
