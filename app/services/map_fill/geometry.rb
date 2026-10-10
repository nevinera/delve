class MapFill
  # Points are [x, y] arrays, in feet.
  module Geometry
    module_function

    def point(location) = [location["x"].to_f, location["y"].to_f]
    def sub(a, b) = [a[0] - b[0], a[1] - b[1]]
    def dot(a, b) = a[0] * b[0] + a[1] * b[1]
    def cross(a, b) = a[0] * b[1] - a[1] * b[0]
    def dist(a, b) = Math.hypot(a[0] - b[0], a[1] - b[1])
    def lerp(a, b, t) = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    def heading(from, to) = Math.atan2(to[1] - from[1], to[0] - from[0])

    def closest_on_segment(p, a, b)
      d = sub(b, a)
      len_sq = dot(d, d)
      return a if len_sq.zero?
      lerp(a, b, (dot(sub(p, a), d) / len_sq).clamp(0.0, 1.0))
    end

    # Signed: positive counterclockwise.
    def ring_area(points) = points.zip(points.rotate).sum { |p, q| cross(p, q) } / 2.0

    def point_in_ring?(p, ring) = ring.zip(ring.rotate(-1)).count { |a, b| crosses_ray?(p, a, b) }.odd?

    # Whether a ray east from p crosses the edge a-b.
    def crosses_ray?((px, py), (xa, ya), (xb, yb))
      (ya > py) != (yb > py) && px < (xb - xa) * (py - ya) / (yb - ya) + xa
    end
  end
end
