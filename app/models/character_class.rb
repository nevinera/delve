class CharacterClass < ApplicationRecord
  WIELD_TYPES = %w[
    axe sword mace dagger fist_weapon polearm staff bow crossbow gun wand thrown
    shield totem book orb
  ].freeze

  belongs_to :user
  has_many :class_abilities, -> { order(:position) }, dependent: :destroy, inverse_of: :character_class

  IDENTIFIER_FORMAT = /\A[a-z0-9_]{3,}\z/
  EXPIRY_GRACE = 1.week

  enum :state, {provided: "provided", fetched: "fetched", validation_failed: "validation_failed"}

  scope :unexpired, -> { where("expires_at IS NULL OR expires_at > ?", Time.current) }
  scope :available, -> { fetched.unexpired }

  after_commit :enqueue_fetch_content, on: :create

  validates :identifier, presence: true,
    format: {with: IDENTIFIER_FORMAT, message: "must be at least 3 characters and contain only lowercase letters, numbers, and underscores"}
  validates :version, presence: true,
    format: {with: /\A\d+\.\d+\z/, message: "must be two numeric segments (e.g. 1.0)"},
    uniqueness: {scope: :identifier, message: "already registered for this class identifier"}
  validates :location, presence: true

  # Compares "1.10" after "1.9".
  def self.version_key(version) = version.split(".").map(&:to_i)

  def self.newest(classes) = classes.max_by { |character_class| version_key(character_class.version) }

  # Gives every fetched version of the class but the newest, unless it's
  # already expiring, EXPIRY_GRACE before it expires.
  def self.expire_superseded!(identifier)
    versions = fetched.where(identifier:)
    latest = newest(versions) or return
    versions.where(expires_at: nil).where.not(id: latest.id).update_all(expires_at: Time.current + EXPIRY_GRACE)
  end

  def expired? = expires_at.present? && expires_at.past?

  private

  def enqueue_fetch_content
    FetchCharacterClassContentJob.perform_later(id)
  end
end
