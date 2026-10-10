class MapFill
  # The segments regions are traced from: walls, line connections and the
  # map's edge, clipped to the map, plus connectors closing near misses -
  # ends within SNAP of each other or of any segment, and ends within SNAP
  # of a circle's edge, which join its center.
  class Outline
    include Geometry

    def self.call(map) = new(map).segments

    def initialize(map)
      @map = map
      dims = map.fetch("feetDimensions")
      @width = dims.fetch("width").to_f
      @height = dims.fetch("height").to_f
      @segments = []
      @ends = []
    end

    def segments
      add_walls
      add_line_connections
      add_border
      add_connectors
      @segments
    end

    private

    def add(a, b, kind, identifier = nil)
      clipped = clip(a, b)
      @segments << Piece.new(*clipped, kind, identifier) if clipped && dist(*clipped) > EPS
    end

    def add_walls
      walls.each do |pts|
        pts.each_cons(2) { |a, b| add(a, b, :wall) }
        @ends.push(pts.first, pts.last) if pts.length >= 2 && dist(pts.first, pts.last) > EPS
      end
    end

    def walls = barriers.select { |b| b["type"] == "wall" }.map { |b| Array(b["locations"]).map { |loc| point(loc) } }

    def add_line_connections
      line_connections.each do |conn|
        a, b = point(conn["start"]), point(conn["end"])
        add(a, b, :connection, conn["identifier"])
        @ends.push(a, b)
      end
    end

    def line_connections = Array(@map["connections"]).select { |c| c["type"] == "line" && c["start"] && c["end"] }

    def add_border
      corners = [[0.0, 0.0], [@width, 0.0], [@width, @height], [0.0, @height]]
      corners.zip(corners.rotate).each { |a, b| add(a, b, :border) }
    end

    def add_connectors
      outlines = @segments.dup
      @ends.each_with_index do |p, i|
        @ends.drop(i + 1).each { |q| connect(p, q) }
        outlines.each { |s| connect(p, closest_on_segment(p, s.a, s.b)) }
        connect_to_circles(p)
      end
    end

    def connect_to_circles(p)
      circles.each { |center, radius| add(p, center, :connector) if dist(p, center) <= SNAP + radius }
    end

    def connect(p, q)
      add(p, q, :connector) if dist(p, q).between?(EPS, SNAP)
    end

    def barriers = Array(@map["barriers"])

    def circles
      @circles ||= barriers.select { |b| b["type"] == "circle" && b["location"] }.map { |b| [point(b["location"]), b["radius"].to_f] }
    end

    # Liang-Barsky: the part of a→b inside the map, or nil.
    def clip(a, b)
      range = edge_limits(a, sub(b, a)).reduce([0.0, 1.0]) do |(t0, t1), (p, q)|
        narrowed = narrow(t0, t1, p, q)
        return nil unless narrowed
        narrowed
      end
      range.map { |t| inside(lerp(a, b, t)) }
    end

    def edge_limits(a, d) = [[-d[0], a[0]], [d[0], @width - a[0]], [-d[1], a[1]], [d[1], @height - a[1]]]

    # One map edge's limit on [t0, t1]; nil when the segment misses the map.
    def narrow(t0, t1, p, q)
      return (q < -EPS) ? nil : [t0, t1] if p.abs < EPS
      t = q / p
      t0, t1 = (p < 0) ? [[t0, t].max, t1] : [t0, [t1, t].min]
      (t0 > t1) ? nil : [t0, t1]
    end

    def inside((x, y)) = [x.clamp(0.0, @width), y.clamp(0.0, @height)]
  end
end
