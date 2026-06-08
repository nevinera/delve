class Zone < ApplicationRecord
  belongs_to :handle
  belongs_to :registering_user, class_name: "User"

  enum :state, {provided: "provided", fetched: "fetched", validation_failed: "validation_failed"}

  after_commit :enqueue_fetch_content, on: :create

  validates :identifier, presence: true,
    format: {with: /\A[a-z_]+\z/, message: "may only contain lowercase letters and underscores"}
  validates :version, presence: true,
    format: {with: /\A\d+\.\d+\z/, message: "must be two numeric segments (e.g. 1.5)"}
  validates :version, uniqueness: {scope: :identifier, message: "already registered for this zone identifier"}
  validates :name, presence: true
  validates :config_url, presence: true
  validates :description, length: {maximum: 1024}, allow_blank: true

  private

  def enqueue_fetch_content
    FetchZoneContentJob.perform_later(id)
  end
end
