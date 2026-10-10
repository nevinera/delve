class MapFill
  # Fills the faces that reach the map's edge (where a wall doesn't cover
  # it) or hold a fill point. A hole - a piece of outline not joined to the
  # rest - takes the state of the face around it, and the map edge's own
  # outside is :outside.
  class Classifier
    include Geometry

    def initialize(graph, fill_points)
      @graph = graph
      @fill_points = fill_points
      @faces = graph.cycles.select { |c| c.area > 0 }
      @component = connected_pieces
    end

    def call
      @faces.each { |f| f.state = reaches_edge?(f) ? :filled : :open }
      fill_marked_faces
      @faces.each { |f| f.side = f.state }
      holes.each { |ring| place(ring) }
    end

    def innermost_face(p, faces = @faces) = faces.select { |f| point_in_ring?(p, f.points) }.min_by(&:area)

    private

    def reaches_edge?(face) = face.half_edges.any? { |h| h.edge.kind == :border }

    def place(ring)
      return ring.side = :outside if ring.half_edges.any? { |h| h.edge.on_border }
      container = innermost_face(ring.points.first, @faces.reject { |f| same_piece?(f, ring) })
      ring.side = container&.state || :open
    end

    def fill_marked_faces = @fill_points.each { |p| innermost_face(p)&.state = :filled }

    def holes = @graph.cycles.reject { |c| c.area > 0 }

    def same_piece?(a, b) = @component[a.half_edges.first.from.id] == @component[b.half_edges.first.from.id]

    # Each vertex's id to its piece's root id (union-find over the edges).
    def connected_pieces
      parent = (0...@graph.vertices.length).to_a
      @graph.edges.each { |e| join(parent, e.forward) }
      parent.each_index.map { |id| root(parent, id) }
    end

    def join(parent, half_edge)
      parent[root(parent, half_edge.from.id)] = root(parent, half_edge.to.id)
    end

    def root(parent, id)
      id = parent[id] = parent[parent[id]] until parent[id] == id
      id
    end
  end
end
