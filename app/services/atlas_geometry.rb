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

  def on_segment?(p, q, r) = within?(r[0], p[0], q[0]) && within?(r[1], p[1], q[1])

  def within?(value, a, b) = value.between?([a, b].min - EPSILON, [a, b].max + EPSILON)

  def distance(a, b) = Math.hypot(b[0] - a[0], b[1] - a[1])

  # Each edge as [from, to], the last closing back to the first point.
  def edges(polygon) = polygon.zip(polygon.rotate)

  # Point i and its neighbors.
  def neighbors(points, i) = [points[i - 1], points[i], points[(i + 1) % points.length]]

  # Whether r lies on segment pq.
  def point_on_segment?(p, q, r)
    cross(p, q, r).abs <= EPSILON * [1, distance(p, q)].max && on_segment?(p, q, r)
  end

  # Whether the points make a simple polygon: at least three, some area, no
  # edge of no length, no edge meeting another except where neighbors share
  # a corner, and no neighbors doubling back along each other.
  def simple_polygon?(polygon)
    return false if flat?(polygon)
    sides = edges(polygon)
    sides.none? { |a, b| distance(a, b) <= EPSILON } &&
      sides.each_index.all? { |i| ((i + 1)...sides.length).all? { |j| edges_apart?(sides, i, j) } }
  end

  # Whether edges i and j (i < j) meet nowhere, besides the corner they share
  # when they're neighbors.
  def edges_apart?(sides, i, j)
    first, second = sides[i], sides[j]
    return corner_only?(*first, *second) if j == i + 1
    return corner_only?(*second, *first) if i == 0 && j == sides.length - 1
    !segments_touch?(*first, *second)
  end

  # Whether edges ab and cd, which share the corner b = c, meet nowhere
  # else (so neither doubles back along the other).
  def corner_only?(a, b, c, d) = !point_on_segment?(a, b, d) && !point_on_segment?(c, d, a)

  def flat?(polygon) = polygon.length < 3 || signed_area(polygon).abs <= EPSILON

  # A simple polygon as triangles, by ear clipping.
  def triangles(polygon)
    points = counterclockwise(polygon)
    result = []
    while points.length > 3
      corner = clip_ear!(points) or break
      result << corner if cross(*corner) > EPSILON
    end
    result << points if points.length == 3 && !flat?(points)
    result
  end

  def counterclockwise(polygon) = (signed_area(polygon) < 0) ? polygon.reverse : polygon.dup

  # Cuts an ear off points and returns its triangle, or nil when there's none
  # (only collinear runs left: nothing more with area).
  def clip_ear!(points)
    ear = points.each_index.find { |i| ear?(points, i) } or return
    corner = neighbors(points, ear)
    points.delete_at(ear)
    corner
  end

  # Whether vertex i of a counterclockwise polygon can be cut off: it turns
  # left (or goes straight on, which cuts off nothing), and no other vertex
  # is in the triangle it makes with its neighbors.
  def ear?(points, i)
    triangle = neighbors(points, i)
    turn = cross(*triangle)
    return true if turn.abs <= EPSILON
    return false if turn < 0
    others = points.rotate(i + 2).first(points.length - 3)
    others.none? { |p| inside?(p, triangle, boundary: true) }
  end

  def on_boundary?(point, polygon)
    edges(polygon).any? { |a, b| point_on_segment?(a, b, point) }
  end

  # Whether point is inside polygon (even-odd), its boundary counting as
  # inside only when boundary is true.
  def inside?(point, polygon, boundary:)
    return boundary if on_boundary?(point, polygon)
    edges(polygon).count { |a, b| crosses_ray?(point, a, b) }.odd?
  end

  # Whether edge ab crosses the ray from point toward +x.
  def crosses_ray?((x, y), (ax, ay), (bx, by))
    (ay > y) != (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax
  end

  def rect_corners(x, y, width, height) = [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]

  # Whether the rectangle (corners, from rect_corners) lies inside polygon:
  # every corner inside it or on its edge, and none of its vertices poking
  # in.
  def rect_inside?(rect, polygon)
    rect.all? { |corner| inside?(corner, polygon, boundary: true) } && polygon.none? { |vertex| inside?(vertex, rect, boundary: false) }
  end

  # Whether two rectangles (from rect_corners) overlap by some area.
  # Their first and third corners are their least and greatest.
  def rects_overlap?((a_min, _, a_max, _), (b_min, _, b_max, _))
    [0, 1].all? { |axis| a_min[axis] < b_max[axis] - EPSILON && b_min[axis] < a_max[axis] - EPSILON }
  end

  # Whether two simple polygons overlap by some area: whether any of their
  # triangles do, by separating axes.
  def polygons_overlap?(a, b)
    triangles_b = triangles(b)
    triangles(a).any? { |s| triangles_b.any? { |t| convex_overlap?(s, t) } }
  end

  def convex_overlap?(a, b)
    [a, b].all? { |polygon| edges(polygon).all? { |p, q| overlap_along?([p[1] - q[1], q[0] - p[0]], a, b) } }
  end

  # Whether a and b's shadows on axis overlap by some length.
  def overlap_along?(axis, a, b)
    min_a, max_a = project(a, axis)
    min_b, max_b = project(b, axis)
    min_a < max_b - EPSILON && min_b < max_a - EPSILON
  end

  def project(polygon, axis) = polygon.map { |v| v[0] * axis[0] + v[1] * axis[1] }.minmax
end
