class Character < ApplicationRecord
  belongs_to :user
  belongs_to :character_class
  has_many :character_items, dependent: :destroy
  has_many :equipped_items, dependent: :destroy

  validates :name, presence: true,
    uniqueness: true,
    length: {minimum: 6, maximum: 16},
    format: {with: /\A[a-zA-Z-]+\z/, message: "must contain only letters and dashes"}
  validates :token_url, presence: true,
    format: {with: /\Ahttps?:\/\/\S+\z/, message: "must be a valid URL"}

  def owned_zone_items_for(zone)
    character_items
      .where(zone_identifier: zone.identifier)
      .each_with_object({}) do |item, hash|
        hash[item.identifier] = item.version == zone.version
      end
  end
end
