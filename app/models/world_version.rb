class WorldVersion < ApplicationRecord
  EXPIRY_GRACE = 24.hours

  belongs_to :world
  has_many :zones, dependent: :destroy
  has_many :world_characters, dependent: :nullify

  enum :state, {importing: "importing", failed: "failed", unreleased: "unreleased", released: "released"}

  # ref is the git tag the version was imported from - for human reference
  # only; content is always read by commit_sha.
  validates :ref, presence: true, uniqueness: {scope: :world_id}

  scope :available, -> { released.where("expires_at IS NULL OR expires_at > ?", Time.current) }

  after_commit :import, on: :create

  def expired? = expires_at.present? && expires_at.past?

  def zone_url(zone) = "#{raw_base_url}#{zone.path}"

  def import = ImportWorldVersionJob.perform_later(id)

  # Releases the version: the world takes this version's name, every other
  # released version of the world that isn't already expiring gets
  # EXPIRY_GRACE before it expires, and their running instances are told so
  # they can count down.
  def release!
    raise ArgumentError, "only unreleased versions can be released" unless unreleased?

    expiring = world.world_versions.released.where(expires_at: nil).where.not(id:)
    expiring_ids = expiring.ids
    transaction { release_and_expire!(expiring) }
    expiring_ids.each { |expiring_id| PushWorldVersionExpiryJob.perform_later(expiring_id) }
  end

  private

  def release_and_expire!(expiring)
    now = Time.current
    expiring.update_all(expires_at: now + EXPIRY_GRACE)
    update!(state: :released, released_at: now)
    world.update!(name:)
  end
end
