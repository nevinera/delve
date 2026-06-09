class CharacterClass < ApplicationRecord
  belongs_to :user
  belongs_to :handle

  enum :state, {provided: "provided", fetched: "fetched", validation_failed: "validation_failed"}

  after_commit :enqueue_fetch_content, on: :create

  validates :identifier, presence: true,
    format: {with: /\A[a-z0-9_]{3,}\z/, message: "must be at least 3 characters and contain only lowercase letters, numbers, and underscores"}
  validates :version, presence: true,
    format: {with: /\A\d+\.\d+\z/, message: "must be two numeric segments (e.g. 1.0)"},
    uniqueness: {scope: [:handle_id, :identifier], message: "already registered for this class identifier"}
  validates :location, presence: true

  def full_identifier
    "#{handle.identifier}/#{identifier}"
  end

  private

  def enqueue_fetch_content
    FetchCharacterClassContentJob.perform_later(id)
  end
end
