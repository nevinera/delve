# The geometry a world's atlas is checked with (docs/schema/world.md#atlas):
# zone outlines are simple quadrilaterals, maps axis-aligned rectangles, all
# in world feet, as [x, y] pairs. Touching (a shared edge or corner) never
# counts as overlapping.
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
    return true if ((d1 > EPSILON && d2 < -EPSILON) || (d1 < -EPSILON && d2 > EPSILON)) &&
      ((d3 > EPSILON && d4 < -EPSILON) || (d3 < -EPSILON && d4 > EPSILON))
    [[d1, c, d, a], [d2, c, d, b], [d3, a, b, c], [d4, a, b, d]].any? { |o, p, q, r| o.abs <= EPSILON && on_segment?(p, q, r) }
  end

  def on_segment?(p, q, r)
    r[0].between?([p[0], q[0]].min - EPSILON, [p[0], q[0]].max + EPSILON) &&
      r[1].between?([p[1], q[1]].min - EPSILON, [p[1], q[1]].max + EPSILON)
  end

  # Whether four points make a simple quadrilateral: some area, and no edge
  # meeting the one opposite it.
  def simple_quad?(quad)
    return false unless quad.length == 4 && signed_area(quad).abs > EPSILON
    !segments_touch?(quad[0], quad[1], quad[2], quad[3]) && !segments_touch?(quad[1], quad[2], quad[3], quad[0])
  end

  # A simple quad as two triangles, split along whichever diagonal is inside.
  def triangles(quad)
    a, b, c, d = quad
    if cross(a, c, b).positive? == cross(a, c, d).positive?
      [[b, c, d], [b, d, a]]
    else
      [[a, b, c], [a, c, d]]
    end
  end

  def on_boundary?(point, polygon)
    polygon.each_with_index.any? do |a, i|
      b = polygon[(i + 1) % polygon.length]
      cross(a, b, point).abs <= EPSILON * [1, Math.hypot(b[0] - a[0], b[1] - a[1])].max && on_segment?(a, b, point)
    end
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

  # Whether the rectangle (corners, from rect_corners) lies inside quad:
  # every corner inside it or on its edge, and none of its corners poking in.
  def rect_inside?(rect, quad)
    rect.all? { |corner| inside?(corner, quad, boundary: true) } && quad.none? { |vertex| inside?(vertex, rect, boundary: false) }
  end

  # Whether two rectangles (from rect_corners) overlap by some area.
  def rects_overlap?(a, b)
    a[0][0] < b[1][0] - EPSILON && b[0][0] < a[1][0] - EPSILON && a[0][1] < b[2][1] - EPSILON && b[0][1] < a[2][1] - EPSILON
  end

  # Whether two simple quads overlap by some area: whether any of their
  # triangles do, by separating axes.
  def quads_overlap?(a, b)
    triangles(a).any? { |s| triangles(b).any? { |t| convex_overlap?(s, t) } }
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
