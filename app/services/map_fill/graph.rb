class MapFill
  # The planar graph of the split outline. Each half-edge's face lies on
  # its left; bounded faces trace counterclockwise (positive area) and each
  # connected piece's outside traces clockwise.
  class Graph
    include Geometry

    NEIGHBORS = [-1, 0, 1].product([-1, 0, 1]).freeze

    attr_reader :vertices, :edges, :cycles

    def initialize(pieces)
      @vertices = []
      @buckets = {}
      @by_pair = {}
      pieces.each { |piece| add(piece) }
      @edges = @by_pair.values
      @vertices.each { |v| sort_around(v) }
      @cycles = @vertices.flat_map(&:out).filter_map { |start| trace(start) unless start.cycle }
    end

    private

    def add(piece)
      u, v = vertex(piece.a), vertex(piece.b)
      return if u.equal?(v)
      pair = [u.id, v.id].sort
      existing = @by_pair[pair]
      existing ? merge(existing, piece) : @by_pair[pair] = new_edge(u, v, piece)
    end

    def merge(edge, piece)
      edge.on_border ||= piece.kind == :border
      return unless KIND_RANK[piece.kind] > KIND_RANK[edge.kind]
      edge.kind = piece.kind
      edge.identifier = piece.identifier
    end

    def new_edge(u, v, piece)
      edge = Edge.new(u.p, v.p, piece.kind, piece.identifier, piece.kind == :border)
      link(edge, u, v)
      edge
    end

    def link(edge, u, v)
      forward = HalfEdge.new(u, v, edge)
      backward = HalfEdge.new(v, u, edge, forward)
      forward.twin = backward
      edge.forward, edge.backward = forward, backward
      u.out << forward
      v.out << backward
    end

    # Bucketed by MERGE-sized cells; a point joins any vertex within MERGE
    # in its own or a neighboring bucket.
    def vertex(p)
      cell = p.map { |c| (c / MERGE).floor }
      nearby(cell).find { |v| dist(v.p, p) <= MERGE } || new_vertex(p, cell)
    end

    def nearby((bx, by)) = NEIGHBORS.flat_map { |dx, dy| @buckets.fetch([bx + dx, by + dy], []) }

    def new_vertex(p, cell)
      Vertex.new(@vertices.length, p, []).tap do |v|
        @vertices << v
        (@buckets[cell] ||= []) << v
      end
    end

    def sort_around(v)
      v.out.each { |h| h.angle = heading(v.p, h.to.p) }
      v.out.sort_by!(&:angle).each_with_index { |h, i| h.index = i }
    end

    def trace(start)
      cycle = Cycle.new([], [])
      h = start
      until h.cycle
        h.cycle = cycle
        cycle.half_edges << h
        cycle.points << h.from.p
        h = next_around(h)
      end
      cycle.area = ring_area(cycle.points)
      cycle
    end

    # From u→v, the next edge clockwise from v→u.
    def next_around(h)
      around = h.to.out
      around[(h.twin.index - 1) % around.length]
    end
  end
end
