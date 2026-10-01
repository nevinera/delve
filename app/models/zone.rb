class Zone < ApplicationRecord
  # A zone is either legacy (registered by hand with its own version and
  # config_url) or imported as part of a WorldVersion (identified by its
  # world zone key and a path relative to the version's raw_base_url).
  # Legacy zones go away in worlds slice 5.
  belongs_to :registering_user, class_name: "User", optional: true
  belongs_to :world_version, optional: true

  enum :state, {provided: "provided", fetched: "fetched", validation_failed: "validation_failed"}

  scope :legacy, -> { where(world_version_id: nil) }

  after_commit :enqueue_fetch_content, on: :create, if: :legacy?

  validates :identifier, presence: true

  with_options if: :legacy? do
    validates :registering_user, presence: true
    validates :identifier,
      format: {with: /\A[a-z_]+\z/, message: "may only contain lowercase letters and underscores"}
    validates :version, presence: true,
      format: {with: /\A\d+\.\d+\z/, message: "must be two numeric segments (e.g. 1.5)"}
    validates :version, uniqueness: {scope: :identifier, message: "already registered for this zone identifier"}
    validates :name, presence: true
    validates :config_url, presence: true
    validates :description, length: {maximum: 1024}, allow_blank: true
  end

  with_options unless: :legacy? do
    validates :identifier, uniqueness: {scope: :world_version_id}
    validates :path, presence: true
  end

  def legacy? = world_version.nil?

  # What item awards and ownership checks treat as this zone's version: a
  # legacy zone's own version, or a world zone's commit SHA. A stopgap until
  # items are tracked per world (worlds slice 4).
  def version_label = legacy? ? version : world_version.commit_sha

  private

  def enqueue_fetch_content
    FetchZoneContentJob.perform_later(id)
  end
end
