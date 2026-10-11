module Validators
  # A map's ground and size (docs/schema/map.md): an image, a cellMap, or
  # both - in which case only the image is used, and the cells are kept
  # (but still checked) so removing the image brings them back.
  # pixelDimensions is the image's size, so it's only needed with one.
  class MapBackgroundValidator < Base
    # How far feetDimensions may be from a cell map's rendered size.
    CELL_MAP_SIZE_TOLERANCE = 0.01

    def validate!(data, path: "$")
      image = given?(data, "imageUrl")
      cells = given?(data, "cellMap")
      raise ValidationError.new("imageUrl or cellMap is required", path: child_path(path, "imageUrl")) unless image || cells
      validate_image!(data, path: path) if image
      feet = validate_feet_dimensions!(require_hash!(data, "feetDimensions", path: path), path: child_path(path, "feetDimensions"))
      validate_cell_map!(data["cellMap"], feet, check_size: !image, path: path) if cells
    end

    private

    def validate_image!(data, path:)
      require_string!(data, "imageUrl", path: path)
      validate_pixel_dimensions!(require_hash!(data, "pixelDimensions", path: path), path: child_path(path, "pixelDimensions"))
    end

    def validate_cell_map!(cell_map, feet, check_size:, path:)
      CellMapValidator.validate!(cell_map, path: child_path(path, "cellMap"))
      validate_cell_map_size!(feet, cell_map["grid"], path: child_path(path, "feetDimensions")) if check_size
    end

    def validate_cell_map_size!(feet, grid, path:)
      size = CellMapValidator.feet_size(grid)
      return if %w[width height].all? { |key| (feet[key] - size[key]).abs <= CELL_MAP_SIZE_TOLERANCE }
      raise ValidationError.new(format("must match the cell map's size, %.2f x %.2f", size["width"], size["height"]), path: path)
    end

    def validate_pixel_dimensions!(data, path:)
      require_object!(data, path: path)
      width = require_integer!(data, "width", path: path)
      raise ValidationError.new("width must be positive", path: child_path(path, "width")) unless width > 0
      height = require_integer!(data, "height", path: path)
      raise ValidationError.new("height must be positive", path: child_path(path, "height")) unless height > 0
    end

    def validate_feet_dimensions!(data, path:)
      require_object!(data, path: path)
      width = require_numeric!(data, "width", path: path)
      raise ValidationError.new("width must be positive", path: child_path(path, "width")) unless width > 0
      height = require_numeric!(data, "height", path: path)
      raise ValidationError.new("height must be positive", path: child_path(path, "height")) unless height > 0
      data
    end
  end
end
