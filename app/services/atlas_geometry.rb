# The geometry a world's atlas is checked with (docs/schema/world.md#atlas):
# zone outlines are simple polygons, maps axis-aligned rectangles, all in
# world feet, as [x, y] pairs. Touching (a shared edge or corner) never
# counts as overlapping. Mirrored by client/src/worldEditor/atlasGeometry.js.
module AtlasGeometry
  module_function

  EPSILON = 1e-6

  def cross(o, a, b) = (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

  def signed_area(polygon)
    polygon.zip(polygon.rotate).sum { |a, b| a[0] * b[1] - b[0] * a[1] } / 2.0
  end

  # Whether segments ab and cd meet at all, endpoints included.
  def segments_touch?(a, b, c, d)
    d1, d2, d3, d4 = cross(c, d, a), cross(c, d, b), cross(a, b, c), cross(a, b, d)
    return true if opposite?(d1, d2) && opposite?(d3, d4)
    [[d1, c, d, a], [d2, c, d, b], [d3, a, b, c], [d4, a, b, d]].any? { |o, p, q, r| o.abs <= EPSILON && on_segment?(p, q, r) }
  end

  def opposite?(a, b) = (a > EPSILON && b < -EPSILON) || (a < -EPSILON && b > EPSILON)

  def on_segment?(p, q, r)
    r[0].between?([p[0], q[0]].min - EPSILON, [p[0], q[0]].max + EPSILON) &&
      r[1].between?([p[1], q[1]].min - EPSILON, [p[1], q[1]].max + EPSILON)
  end

  # Whether r lies on segment pq.
  def point_on_segment?(p, q, r)
    cross(p, q, r).abs <= EPSILON * [1, Math.hypot(q[0] - p[0], q[1] - p[1])].max && on_segment?(p, q, r)
  end

  # Whether the points make a simple polygon: at least three, some area, no
  # edge of no length, no edge meeting another except where neighbors share
  # a corner, and no neighbors doubling back along each other.
  def simple_polygon?(polygon)
    n = polygon.length
    return false if n < 3 || signed_area(polygon).abs <= EPSILON
    edges = polygon.each_index.map { |i| [polygon[i], polygon[(i + 1) % n]] }
    return false if edges.any? { |a, b| Math.hypot(b[0] - a[0], b[1] - a[1]) <= EPSILON }
    edges.each_with_index.all? do |(a, b), i|
      ((i + 1)...n).all? do |j|
        c, d = edges[j]
        if j == i + 1 then !point_on_segment?(a, b, d) && !point_on_segment?(c, d, a)
        elsif i == 0 && j == n - 1 then !point_on_segment?(a, b, c) && !point_on_segment?(c, d, b)
        else !segments_touch?(a, b, c, d)
        end
      end
    end
  end

  # A simple polygon as triangles, by ear clipping.
  def triangles(polygon)
    points = (signed_area(polygon) < 0) ? polygon.reverse : polygon.dup
    result = []
    while points.length > 3
      ear = points.each_index.find { |i| ear?(points, i) }
      break if ear.nil? # only collinear runs left: nothing more with area
      prev, cur, nxt = points[ear - 1], points[ear], points[(ear + 1) % points.length]
      result << [prev, cur, nxt] if cross(prev, cur, nxt) > EPSILON
      points.delete_at(ear)
    end
    result << points if points.length == 3 && cross(*points).abs > EPSILON
    result
  end

  # Whether vertex i of a counterclockwise polygon can be cut off: it turns
  # left (or goes straight on, which cuts off nothing), and no other vertex
  # is in the triangle it makes with its neighbors.
  def ear?(points, i)
    prev, cur, nxt = points[i - 1], points[i], points[(i + 1) % points.length]
    turn = cross(prev, cur, nxt)
    return true if turn.abs <= EPSILON
    return false if turn < 0
    triangle = [prev, cur, nxt]
    own = [(i - 1) % points.length, i, (i + 1) % points.length]
    points.each_with_index.none? { |p, j| !own.include?(j) && inside?(p, triangle, boundary: true) }
  end

  def on_boundary?(point, polygon)
    polygon.each_with_index.any? { |a, i| point_on_segment?(a, polygon[(i + 1) % polygon.length], point) }
  end

  # Whether point is inside polygon (even-odd), its boundary counting as
  # inside only when boundary is true.
  def inside?(point, polygon, boundary:)
    return boundary if on_boundary?(point, polygon)
    x, y = point
    inside = false
    polygon.each_with_index do |a, i|
      b = polygon[i - 1]
      inside = !inside if (a[1] > y) != (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]
    end
    inside
  end

  def rect_corners(x, y, width, height) = [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]

  # Whether the rectangle (corners, from rect_corners) lies inside polygon:
  # every corner inside it or on its edge, and none of its vertices poking
  # in.
  def rect_inside?(rect, polygon)
    rect.all? { |corner| inside?(corner, polygon, boundary: true) } && polygon.none? { |vertex| inside?(vertex, rect, boundary: false) }
  end

  # Whether two rectangles (from rect_corners) overlap by some area.
  def rects_overlap?(a, b)
    a[0][0] < b[1][0] - EPSILON && b[0][0] < a[1][0] - EPSILON && a[0][1] < b[2][1] - EPSILON && b[0][1] < a[2][1] - EPSILON
  end

  # Whether two simple polygons overlap by some area: whether any of their
  # triangles do, by separating axes.
  def polygons_overlap?(a, b)
    triangles_b = triangles(b)
    triangles(a).any? { |s| triangles_b.any? { |t| convex_overlap?(s, t) } }
  end

  def convex_overlap?(a, b)
    [a, b].all? do |polygon|
      polygon.each_with_index.all? do |p, i|
        q = polygon[(i + 1) % polygon.length]
        axis = [p[1] - q[1], q[0] - p[0]]
        min_a, max_a = a.map { |v| v[0] * axis[0] + v[1] * axis[1] }.minmax
        min_b, max_b = b.map { |v| v[0] * axis[0] + v[1] * axis[1] }.minmax
        min_a < max_b - EPSILON && min_b < max_a - EPSILON
      end
    end
  end
end
