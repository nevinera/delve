module Validators
  # A map's inline cellMap (docs/schema/map.md#cellmap): a grid of terrain
  # cells and trails the client renders into the map's ground. Ports
  # client/src/cellMap/format.js; both read the themes from themes.json.
  class CellMapValidator < Base
    VERSION = 1
    MAX_DIMENSION = 200
    # Feet across a cell's flats, the same on every map (see
    # client/src/cellMap/hexGrid.js's CELL_SIZE).
    CELL_SIZE = 5
    THEMES_PATH = Rails.root.join("client/src/cellMap/themes.json")
    COLOR_RE = /\A#[0-9a-fA-F]{6}\z/

    def self.themes
      @themes ||= JSON.parse(File.read(THEMES_PATH)).freeze
    end

    # The rendered size in feet: flat-top hexes, odd columns half a cell
    # lower (see client/src/cellMap/hexGrid.js's mapSize).
    def self.feet_size(grid, cell_size = CELL_SIZE)
      cols, rows = grid.values_at("cols", "rows")
      r = cell_size / Math.sqrt(3)
      {"width" => 1.5 * r * cols + 0.5 * r, "height" => cell_size * rows + ((cols > 1) ? cell_size / 2.0 : 0)}
    end

    def validate!(data, path: "$")
      require_object!(data, path: path)
      validate_version!(data, path: path)
      require_integer!(data, "seed", path: path)
      theme = validate_theme!(data, path: path)
      validate_colors!(data["colors"], theme, path: child_path(path, "colors")) unless data["colors"].nil?
      validate_layout!(data, theme, path: path)
    end

    private

    def validate_layout!(data, theme, path:)
      grid = validate_grid!(require_hash!(data, "grid", path: path), theme, path: child_path(path, "grid"))
      validate_cells!(require_array!(data, "cells", path: path), grid, theme, path: child_path(path, "cells"))
      validate_trails!(require_array!(data, "trails", path: path), path: child_path(path, "trails")) unless data["trails"].nil?
    end

    def validate_version!(data, path:)
      return if require_key!(data, "version", path: path) == VERSION
      raise ValidationError.new("version must be #{VERSION}", path: child_path(path, "version"))
    end

    def validate_theme!(data, path:)
      name = require_string!(data, "theme", path: path)
      require_one_of!(name, self.class.themes.keys, path: child_path(path, "theme"))
      self.class.themes[name]
    end

    def validate_colors!(colors, theme, path:)
      raise ValidationError.new("colors must be an object", path: path) unless colors.is_a?(Hash)
      colors.each do |key, value|
        require_one_of!(key, theme["colors"].keys, path: child_path(path, key))
        raise ValidationError.new("#{key} must be a \"#rrggbb\" color", path: child_path(path, key)) unless value.is_a?(String) && COLOR_RE.match?(value)
      end
    end

    def validate_grid!(grid, theme, path:)
      require_one_of!(require_string!(grid, "type", path: path), theme["grids"], path: child_path(path, "type"))
      %w[cols rows].each { |key| validate_dimension!(grid, key, path: path) }
      grid
    end

    def validate_dimension!(grid, key, path:)
      return if require_integer!(grid, key, path: path).between?(1, MAX_DIMENSION)
      raise ValidationError.new("#{key} must be from 1 to #{MAX_DIMENSION}", path: child_path(path, key))
    end

    def validate_cells!(cells, grid, theme, path:)
      raise ValidationError.new("has #{cells.length} rows, grid.rows is #{grid["rows"]}", path: path) unless cells.length == grid["rows"]
      cells.each_with_index { |row, i| validate_row!(row, grid["cols"], theme["terrains"].keys, path: index_path(path, i)) }
    end

    def validate_row!(row, cols, alphabet, path:)
      raise ValidationError.new("must be a string", path: path) unless row.is_a?(String)
      raise ValidationError.new("has #{row.length} cells, grid.cols is #{cols}", path: path) unless row.length == cols
      validate_alphabet!(row, alphabet, path: path)
    end

    def validate_alphabet!(row, alphabet, path:)
      unknown = row.chars.uniq - alphabet
      return if unknown.empty?
      raise ValidationError.new("has unknown cells: #{unknown.map(&:inspect).join(", ")}", path: path)
    end

    def validate_trails!(trails, path:)
      trails.each_with_index { |trail, i| validate_trail!(trail, path: index_path(path, i)) }
    end

    def validate_trail!(trail, path:)
      require_object!(trail, path: path)
      width = require_numeric!(trail, "width", path: path)
      raise ValidationError.new("width must be positive", path: child_path(path, "width")) unless width > 0
      points = require_array!(trail, "points", path: path, min: 2)
      points.each_with_index { |point, j| validate_point!(point, path: index_path(child_path(path, "points"), j)) }
    end

    def validate_point!(point, path:)
      return if point.is_a?(Array) && point.length == 2 && point.all?(Numeric)
      raise ValidationError.new("must be [col, row]", path: path)
    end
  end
end
