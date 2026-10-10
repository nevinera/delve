# frozen_string_literal: true

module Bot
  # Plane geometry on [x, y] points, in feet.
  module Geometry
    module_function

    def sub(a, b) = [a[0] - b[0], a[1] - b[1]]

    def dot(a, b) = a[0] * b[0] + a[1] * b[1]

    def cross(a, b) = a[0] * b[1] - a[1] * b[0]

    def length(v) = Math.hypot(v[0], v[1])

    def distance(a, b) = length(sub(a, b))

    # The point `t` of the way along from a, by v.
    def along(a, v, t) = [a[0] + v[0] * t, a[1] + v[1] * t]

    def point_segment_distance(point, a, b)
      ab = sub(b, a)
      distance(point, along(a, ab, projection(point, a, ab)))
    end

    # How far along a -> a + ab the point's nearest spot is, from 0 to 1.
    def projection(point, a, ab)
      length_squared = dot(ab, ab)
      length_squared.zero? ? 0 : (dot(sub(point, a), ab) / length_squared).clamp(0, 1)
    end

    def segment_distance(a, b, p, q)
      return 0.0 if crosses?(a, b, p, q)
      [point_segment_distance(a, p, q), point_segment_distance(b, p, q),
        point_segment_distance(p, a, b), point_segment_distance(q, a, b)].min
    end

    def crosses?(a, b, p, q) = straddles?(p, q, a, b) && straddles?(a, b, p, q)

    # Whether p and q lie on opposite sides of the line through a and b.
    def straddles?(a, b, p, q) = side(a, b, p) * side(a, b, q) < 0

    def side(a, b, point) = cross(sub(b, a), sub(point, a))
  end
end
