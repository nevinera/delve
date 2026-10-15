module Validators
  # The graphic of a groundArea: a tint and/or a tiled texture.
  class AreaGraphicValidator < Base
    def validate!(graphic, path: "$")
      validate_hex_color!(graphic, "color", path: path) if given?(graphic, "color")
      validate_texture_url!(graphic, path: path) if given?(graphic, "textureURL")
      validate_texture_scale!(graphic, path: path) if given?(graphic, "textureScale")
      validate_opacity!(graphic, path: path) if given?(graphic, "opacity")
    end

    private

    def validate_texture_url!(graphic, path:)
      url = require_string!(graphic, "textureURL", path: path)
      return unless stock_reference?(url)
      validate_stock_reference!(url, Content::StockAssets::GRAPHICS.keys, path: child_path(path, "textureURL"))
    end

    def validate_texture_scale!(graphic, path:)
      scale = require_numeric!(graphic, "textureScale", path: path)
      raise ValidationError.new("textureScale must be greater than 0", path: child_path(path, "textureScale")) unless scale.positive?
    end

    def validate_opacity!(graphic, path:)
      opacity = require_numeric!(graphic, "opacity", path: path)
      return if opacity.between?(0, 1)
      raise ValidationError.new("opacity must be between 0 and 1", path: child_path(path, "opacity"))
    end
  end
end
