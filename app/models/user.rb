class User < ApplicationRecord
  devise :rememberable, :trackable,
    :omniauthable, omniauth_providers: [:google_oauth2]

  has_many :character_classes, dependent: :destroy
  has_many :handles, dependent: :destroy

  validates :handle, uniqueness: true, allow_nil: true
  validates :handle, format: {with: /\A[a-z0-9_]{6,}\z/, message: "must be at least 6 characters and contain only lowercase letters, numbers, and underscores"}, allow_nil: true

  def self.from_omniauth(auth)
    find_or_create_by(provider: auth.provider, uid: auth.uid) do |user|
      user.email = auth.info.email
      user.name = auth.info.name
    end
  end
end
