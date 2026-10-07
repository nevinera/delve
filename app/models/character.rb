class Character < ApplicationRecord
  belongs_to :user
  belongs_to :character_class
  has_one :character_setting, dependent: :destroy
  has_many :world_characters, dependent: :destroy

  validates :name, presence: true,
    uniqueness: true,
    length: {minimum: 6, maximum: 16},
    format: {with: /\A[a-zA-Z-]+\z/, message: "must contain only letters and dashes"}

  # token_url is a stock token reference (":human-female-1:", see
  # Content::StockAssets::TOKENS) or an image URL.
  STOCK_TOKEN_FORMAT = /\A:([a-z0-9-]+):\z/
  URL_FORMAT = /\Ahttps?:\/\/\S+\z/

  validates :token_url, presence: true
  validate :token_url_is_stock_or_url

  def setting_or_default = character_setting || build_character_setting

  # When the character last entered any world.
  def last_played_at = world_characters.maximum(:last_played_at)

  # The world character the character last entered with, or nil. Reads the
  # loaded association, so preload world_characters when listing.
  def last_world_character = world_characters.select(&:last_played_at).max_by(&:last_played_at)

  # The stock token's name, or nil for a custom URL.
  def stock_token = token_url.to_s[STOCK_TOKEN_FORMAT, 1]

  # Something an <img> or texture loader can use: a stock token's
  # server-hosted path, or the custom URL as given.
  def token_image_url
    return token_url unless stock_token
    Content::StockAssets.token_url(stock_token) if Content::StockAssets.token?(stock_token)
  end

  private

  def token_url_is_stock_or_url
    return if token_url.blank?
    if stock_token
      errors.add(:token_url, "is not a known stock token") unless Content::StockAssets.token?(stock_token)
    elsif !token_url.match?(URL_FORMAT)
      errors.add(:token_url, "must be a valid URL")
    end
  end
end
