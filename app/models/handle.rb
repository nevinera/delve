class Handle < ApplicationRecord
  belongs_to :user

  validates :identifier, presence: true, uniqueness: true,
    format: {with: /\A[a-z0-9_]{6,}\z/, message: "must be at least 6 characters and contain only lowercase letters, numbers, and underscores"}
end
