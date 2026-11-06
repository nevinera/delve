# A single-use signup link. It isn't for any one address: whoever opens it first can make an account
# with it, and then it's used. People who already have an account sign in without one.
class Invitation < ApplicationRecord
  NOTE_LIMIT = 200

  has_secure_token :token
  belongs_to :created_by, class_name: "User", optional: true # nil when issued from the console
  belongs_to :used_by, class_name: "User", optional: true

  validates :note, length: {maximum: NOTE_LIMIT}

  scope :unused, -> { where(used_at: nil) }

  def used? = used_at.present?

  # Marks it used by `user`, unless someone used it first. Whether it was this call that used it.
  def use!(user)
    used = self.class.unused.where(id: id).update_all(used_by_id: user.id, used_at: Time.current, updated_at: Time.current) == 1
    reload
    used
  end
end
