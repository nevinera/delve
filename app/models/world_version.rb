class WorldVersion < ApplicationRecord
  belongs_to :world
  belongs_to :registering_user, class_name: "User"
  has_many :zones, dependent: :destroy

  enum :state, {provided: "provided", fetched: "fetched", validation_failed: "validation_failed"}

  scope :published, -> { where(state: :fetched) }

  validates :version, presence: true,
    format: {with: ContentVersion::FORMAT, message: "must be two numeric segments (e.g. 1.5)"}
  validates :version, uniqueness: {scope: :world_id, message: "already published for this world"}
  validates :config_url, presence: true

  def content_version = ContentVersion.parse(version)
end
