# Resolves an ability's iconURL into something an <img> can load directly:
# a ":name:" stock reference becomes this app's server-hosted stock icon, and
# a relative path is resolved against the class file's own location (the
# same way the client resolves it against a class's config URL). Absolute
# URLs pass through unchanged; a blank or unrecognized value returns nil.
class CharacterClasses::IconUrl
  STOCK_REFERENCE = /\A:(.+):\z/

  def self.call(...) = new(...).call

  def initialize(icon_url:, location:)
    @icon_url = icon_url
    @location = location
  end

  def call
    return nil if @icon_url.blank?

    stock_name = @icon_url[STOCK_REFERENCE, 1]
    return stock_url(stock_name) if stock_name

    URI.join(@location, @icon_url).to_s
  rescue URI::Error
    nil
  end

  private

  def stock_url(name)
    Content::StockAssets.icon?(name) ? Content::StockAssets.icon_url(name) : nil
  end
end
