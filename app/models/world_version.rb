class WorldVersion < ApplicationRecord
  EXPIRY_GRACE = 24.hours

  belongs_to :world
  has_many :zones, dependent: :destroy

  enum :state, {importing: "importing", failed: "failed", unreleased: "unreleased", released: "released"}
  enum :ref_kind, {tag: "tag", branch: "branch"}

  has_secure_token :share_token

  validates :ref, presence: true, uniqueness: {scope: :world_id}

  scope :available, -> { released.where("expires_at IS NULL OR expires_at > ?", Time.current) }

  def expired? = expires_at.present? && expires_at.past?

  def zone_url(zone) = "#{raw_base_url}#{zone.path}"

  # Releases a tag version: every other released version of the world that
  # isn't already expiring gets EXPIRY_GRACE before it expires. Betas
  # (branch versions) are never released, and never expire.
  def release!
    raise ArgumentError, "only tag versions can be released" unless tag?
    raise ArgumentError, "only unreleased versions can be released" unless unreleased?

    now = Time.current
    transaction do
      world.world_versions.released.where(expires_at: nil).where.not(id:).update_all(expires_at: now + EXPIRY_GRACE)
      update!(state: :released, released_at: now)
    end
  end
end
