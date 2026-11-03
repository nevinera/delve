class User < ApplicationRecord
  ROLES = %w[system_admin].freeze

  devise :rememberable, :trackable,
    :omniauthable, omniauth_providers: [:google_oauth2]

  has_many :characters, dependent: :destroy
  has_many :worlds, dependent: :destroy
  has_one :github_connection, dependent: :destroy

  validates :role, inclusion: {in: ROLES}, allow_nil: true

  def system_admin? = role == "system_admin"

  def self.from_omniauth(auth)
    find_or_create_by(provider: auth.provider, uid: auth.uid) do |user|
      user.email = auth.info.email
      user.name = auth.info.name
    end
  end
end
