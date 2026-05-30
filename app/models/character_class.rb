class CharacterClass < ApplicationRecord
  belongs_to :user
  belongs_to :handle

  serialize :definition, coder: JSON

  validates :identifier, presence: true,
    format: {with: /\A[a-z0-9_]{3,}\z/, message: "must be at least 3 characters and contain only lowercase letters, numbers, and underscores"},
    uniqueness: {scope: :handle_id}
  validates :location, presence: true
  validates :definition, presence: true

  def full_identifier
    "#{handle.identifier}/#{identifier}"
  end
end
