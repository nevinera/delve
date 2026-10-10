# The parts of a map nobody can stand in: every region whose outline
# reaches the map's edge somewhere a wall doesn't cover it, and every region
# holding one of the map's fillPoints (docs/schema/map.md#fill). The same
# algorithm as client/src/game/mapFill.js; the two needn't produce identical
# polygons, only the same regions.
#
#   fill = MapFill.call(map_data)
#   fill.edges    # => [Edge], each with left/right one of :filled, :open
#                 #    or :outside (off the map)
#   fill.state_at([x, y]) # => :filled or :open
#
# Outline gathers the segments, Splitter breaks them where they cross,
# Graph traces the regions between them and Classifier fills them.
class MapFill
  SNAP = 0.5 # feet
  MERGE = 1e-4 # feet; points closer than this are one vertex
  EPS = 1e-7
  # When two pieces coincide, the higher rank's kind wins: a wall along the
  # map's edge seals it.
  KIND_RANK = {wall: 3, connection: 3, connector: 2, border: 1}.freeze

  Piece = Struct.new(:a, :b, :kind, :identifier)
  Edge = Struct.new(:a, :b, :kind, :identifier, :on_border, :left, :right, :forward, :backward)
  HalfEdge = Struct.new(:from, :to, :edge, :twin, :angle, :index, :cycle)
  Vertex = Struct.new(:id, :p, :out)
  Cycle = Struct.new(:half_edges, :points, :area, :state, :side)

  def self.call(map) = new(map)

  attr_reader :edges

  def initialize(map)
    graph = Graph.new(Splitter.call(Outline.call(map)))
    @classifier = Classifier.new(graph, fill_points(map)).tap(&:call)
    @edges = graph.edges.each { |e| assign_sides(e) }
  end

  # Whether a point is in the fill or on open ground.
  def state_at(point) = @classifier.innermost_face(point)&.state || :filled

  private

  def fill_points(map) = Array(map["fillPoints"]).map { |loc| Geometry.point(loc) }

  def assign_sides(edge)
    edge.left = edge.forward.cycle.side
    edge.right = edge.backward.cycle.side
  end
end
