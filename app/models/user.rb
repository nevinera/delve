class User < ApplicationRecord
  devise :rememberable, :trackable,
    :omniauthable, omniauth_providers: [:google_oauth2]

  has_many :character_classes, dependent: :destroy
  has_many :characters, dependent: :destroy
  has_many :handles, dependent: :destroy

  def self.from_omniauth(auth)
    find_or_create_by(provider: auth.provider, uid: auth.uid) do |user|
      user.email = auth.info.email
      user.name = auth.info.name
    end
  end
end
