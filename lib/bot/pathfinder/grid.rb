# frozen_string_literal: true

module Bot
  class Pathfinder
    # A map's walkable ground as `cell`-foot squares: a cell is blocked when
    # its center is within clearance of a barrier, or off the map. Cells
    # are [column, row]; column 0 starts at x = 0, row 0 at y = 0.
    class Grid
      include Geometry

      def initialize(feet, cell:)
        @cell = cell
        @columns = (feet["width"].to_f / cell).ceil
        @rows = (feet["height"].to_f / cell).ceil
        @blocked = Array.new(@columns * @rows, false)
      end

      def open?(col, row) = col.between?(0, @columns - 1) && row.between?(0, @rows - 1) && !@blocked[index(col, row)]

      def cell_at(point) = [(point[0].to_f / @cell).floor, (point[1].to_f / @cell).floor]

      def center(cell) = [(cell[0] + 0.5) * @cell, (cell[1] + 0.5) * @cell]

      def block_segment(p, q, clearance)
        block_near([p, q], clearance) { |at| point_segment_distance(at, p, q) }
      end

      def block_circle(center, radius)
        block_near([center], radius) { |at| distance(at, center) }
      end

      private

      # Blocks the cells around `points` whose distance (from the block) is
      # under `reach`.
      def block_near(points, reach)
        cells_around(points, reach).each { |c| @blocked[index(*c)] = true if yield(center(c)) < reach }
      end

      def cells_around(points, reach)
        columns = span(points.map(&:first), reach, @columns)
        rows = span(points.map(&:last), reach, @rows)
        columns.to_a.product(rows.to_a)
      end

      def span(values, reach, count) = ([((values.min - reach) / @cell).floor, 0].max..[((values.max + reach) / @cell).floor, count - 1].min)

      def index(col, row) = row * @columns + col
    end
  end
end
