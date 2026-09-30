class World < ApplicationRecord
  has_many :world_versions, dependent: :destroy
  has_many :character_worlds, dependent: :destroy

  validates :identifier, presence: true, uniqueness: true,
    format: {with: /\A[a-z_]+\z/, message: "may only contain lowercase letters and underscores"}
  validates :name, presence: true
  validates :description, length: {maximum: 1024}, allow_blank: true

  # The version new joins get: the highest-numbered version that has been
  # fetched and validated.
  def latest_version
    world_versions.published.max_by { |wv| wv.content_version }
  end
end
