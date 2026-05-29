class CharacterClass < ApplicationRecord
  belongs_to :user

  serialize :definition, coder: JSON

  before_validation :prefix_identifier_with_handle

  validate :user_must_have_handle
  validates :identifier, presence: true, uniqueness: true,
    format: {with: /\A[a-z0-9_]+\/[a-z0-9_]+\z/, message: "must be in the format handle/name"},
    unless: -> { errors[:base].any? }
  validates :location, presence: true
  validates :definition, presence: true

  private

  def prefix_identifier_with_handle
    return if identifier.blank? || user&.handle.blank?
    unless identifier.start_with?("#{user.handle}/")
      self.identifier = "#{user.handle}/#{identifier}"
    end
  end

  def user_must_have_handle
    errors.add(:base, "owner must set a handle before registering a character class") if user&.handle.blank?
  end
end
