class User < ApplicationRecord
  ROLES = %w[system_admin].freeze

  devise :rememberable, :trackable,
    :omniauthable, omniauth_providers: [:google_oauth2]

  has_many :characters, dependent: :destroy
  has_many :worlds, dependent: :destroy
  has_one :github_connection, dependent: :destroy
  has_many :client_errors, dependent: :nullify
  has_many :problem_reports, dependent: :nullify
  has_many :invitations_issued, class_name: "Invitation", foreign_key: :created_by_id, dependent: :nullify, inverse_of: :created_by
  has_one :invitation, foreign_key: :used_by_id, dependent: :nullify, inverse_of: :used_by

  validates :role, inclusion: {in: ROLES}, allow_nil: true

  def system_admin? = role == "system_admin"
end
