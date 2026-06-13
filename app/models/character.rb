class Character < ApplicationRecord
  belongs_to :user
  belongs_to :character_class

  validates :name, presence: true,
    uniqueness: true,
    length: {minimum: 6, maximum: 16},
    format: {with: /\A[a-zA-Z-]+\z/, message: "must contain only letters and dashes"}
  validates :token_url, presence: true,
    format: {with: /\Ahttps?:\/\/\S+\z/, message: "must be a valid URL"}
end
