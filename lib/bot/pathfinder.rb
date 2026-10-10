# frozen_string_literal: true

module Bot
  # Plans walkable routes across one map, around its barriers (walls and
  # circles, as in docs/schema/map.md), for a token of a given clearance
  # (its radius, plus a little room). A* over a Grid of `cell`-foot squares,
  # 8-connected, then pulled tight: the route it returns is the fewest
  # straight legs that keep that clearance from every barrier.
  #
  #   finder = Bot::Pathfinder.new(map_data, clearance: 3)
  #   finder.path([x0, y0], [x1, y1]) # => [[x, y], ..., [x1, y1]], or nil
  #
  # Build one per map and reuse it; building does the barrier work.
  class Pathfinder
    include Geometry

    DIAGONAL = Math.sqrt(2)
    STEPS = [[1, 0, 1.0], [-1, 0, 1.0], [0, 1, 1.0], [0, -1, 1.0],
      [1, 1, DIAGONAL], [1, -1, DIAGONAL], [-1, 1, DIAGONAL], [-1, -1, DIAGONAL]].freeze
    # How far (in cells) to look for open ground when an end of the route
    # sits inside a barrier's clearance.
    SNAP_CELLS = 4

    attr_reader :clearance

    def initialize(map_data, clearance:, cell: 2.0)
      @clearance = clearance.to_f
      @grid = Grid.new(map_data.fetch("feetDimensions"), cell: cell.to_f)
      @segments = []
      @circles = []
      map_data.fetch("barriers", []).each { |barrier| add_barrier(barrier) }
    end

    # The route from `from` to `to` ([x, y] in feet), as waypoints after the
    # start and ending at `to`; nil when there's no way through.
    def path(from, to)
      start, goal = [from, to].map { |point| open_cell(@grid.cell_at(point)) }
      return nil unless start && goal
      cells = search(start, goal) or return nil
      pull_tight([from, *cells[1...-1].map { |c| @grid.center(c) }, to]).drop(1)
    end

    # Whether a token can walk straight from a to b.
    def clear?(a, b)
      @segments.none? { |p, q| segment_distance(a, b, p, q) < @clearance } &&
        @circles.none? { |c, r| point_segment_distance(c, a, b) < r + @clearance }
    end

    private

    def add_barrier(barrier)
      case barrier["type"]
      when "wall" then add_wall(barrier["locations"].map { |l| point(l) })
      when "circle" then add_circle(point(barrier["location"]), barrier["radius"].to_f)
      end
    end

    def add_wall(points)
      points.each_cons(2) do |p, q|
        @segments << [p, q]
        @grid.block_segment(p, q, @clearance)
      end
    end

    def add_circle(center, radius)
      @circles << [center, radius]
      @grid.block_circle(center, radius + @clearance)
    end

    def point(location) = [location["x"].to_f, location["y"].to_f]

    def search(start, goal)
      @open = MinHeap.new.tap { |heap| heap.push(0, start) }
      @came_from = {start => nil}
      @cost = {start => 0.0}
      until @open.empty?
        current = @open.pop
        return trace(goal) if current == goal
        expand(current, goal)
      end
    end

    def expand(current, goal)
      neighbors(current).each do |neighbor, step|
        next unless improves?(neighbor, @cost[current] + step)
        @came_from[neighbor] = current
        @open.push(@cost[neighbor] + heuristic(neighbor, goal), neighbor)
      end
    end

    # Records next_cost for the cell when it's the cheapest way there yet.
    def improves?(cell, next_cost)
      return false if @cost.key?(cell) && @cost[cell] <= next_cost
      @cost[cell] = next_cost
    end

    # Open neighbors, with the step's cost in cells; a diagonal step can't
    # cut a blocked corner.
    def neighbors(cell)
      col, row = cell
      STEPS.filter_map do |dc, dr, step|
        next unless @grid.open?(col + dc, row + dr) && @grid.open?(col + dc, row) && @grid.open?(col, row + dr)
        [[col + dc, row + dr], step]
      end
    end

    # Octile distance, in cells.
    def heuristic(a, b)
      dc, dr = (a[0] - b[0]).abs, (a[1] - b[1]).abs
      [dc, dr].max + (DIAGONAL - 1) * [dc, dr].min
    end

    def trace(cell)
      cells = []
      while cell
        cells.unshift(cell)
        cell = @came_from[cell]
      end
      cells
    end

    # Drops every waypoint the one before can see past.
    def pull_tight(points)
      tight = [points.first]
      i = 0
      while i < points.size - 1
        i = furthest_visible(points, i)
        tight << points[i]
      end
      tight
    end

    def furthest_visible(points, i)
      j = points.size - 1
      j -= 1 while j > i + 1 && !clear?(points[i], points[j])
      j
    end

    # The nearest open cell to `cell`, searching outward a few cells.
    def open_cell(cell)
      (0..SNAP_CELLS).each do |ring|
        found = ring_cells(cell, ring).select { |c| @grid.open?(*c) }.min_by { |c| distance(c, cell) }
        return found if found
      end
      nil
    end

    def ring_cells(cell, ring) = ring_offsets(ring).map { |dc, dr| [cell[0] + dc, cell[1] + dr] }

    # The [column, row] offsets exactly `ring` cells out, in a square.
    def ring_offsets(ring)
      span = (-ring..ring).to_a
      span.product(span).select { |dc, dr| [dc.abs, dr.abs].max == ring }
    end
  end
end
