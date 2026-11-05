module Bot
  # A slab, as client/src/world/slabs.js lays it out (.agents/formats.md): where the bot can
  # stand on it, and whether a move runs into it.
  class Slab
    REACH_FT = 256.0

    attr_reader :low, :high, :at, :turn, :outline, :thickness

    def initialize(json)
      @at = json.fetch("at")
      @turn = json.fetch("turn")
      @outline = json.fetch("outline")
      @holes = json["holes"] || []
      @thickness = json.fetch("thickness")
      down = Slab.turn_point([0, -@thickness, 0], @turn)
      corners = @outline.flat_map do |u, v|
        top = add(@at, Slab.turn_point([u, 0, v], @turn))
        [top, add(top, down)]
      end
      @low = (0..2).map { |k| corners.map { _1[k] }.min }
      @high = (0..2).map { |k| corners.map { _1[k] }.max }
    end

    # Whether its corners come within `by` feet of (x, z) across the ground.
    def near?(x, z, by)
      x.between?(@low[0] - by, @high[0] + by) && z.between?(@low[2] - by, @high[2] + by)
    end

    # The tops of it the bot could stand on along the upright line through (x, z): where each
    # stretch of the line inside it comes out through a face tilting no more than `steepest` (rise
    # over run). Heights in feet, lowest first. Holes go right through.
    def footholds(x, z, steepest)
      least = 1 / Math.hypot(1, steepest)
      p = local([x, 0, z])
      d = sub(local([x, 1, z]), p)
      stretches(p, d, -Float::INFINITY, Float::INFINITY).filter_map do |from_t, to_t, by_face|
        up =
          if by_face
            d[1].abs
          else
            point = [p[0] + d[0] * to_t, p[2] + d[2] * to_t]
            a, b = nearest_edge(point)
            length = Math.hypot(b[0] - a[0], b[1] - a[1])
            normal = [(b[1] - a[1]) / length, -(b[0] - a[0]) / length]
            normal = normal.map(&:-@) if inside?([point[0] + normal[0] * 0.01, point[1] + normal[1] * 0.01])
            Slab.turn_point([normal[0], 0, normal[1]], @turn)[1]
          end
        to_t if up >= least - 1e-9 && to_t < 1e5
      end
    end

    # Whether the straight move from a to b goes into it: past its start, into a part of it the
    # start isn't already in.
    def enters?(a, b)
      p = local(a)
      stretches(p, sub(local(b), p), 0, 1).any? { |from_t, _| from_t > 1e-6 }
    end

    # Turns a point by [yaw, pitch, roll] degrees: roll, then pitch, then yaw
    # (client/src/world/builtObjects.js turnPoint).
    def self.turn_point((x, y, z), (yaw, pitch, roll))
      r = ->(d) { d * Math::PI / 180 }
      cz, sz = Math.cos(r[roll]), Math.sin(r[roll])
      cx, sx = Math.cos(r[pitch]), Math.sin(r[pitch])
      cy, sy = Math.cos(r[yaw]), Math.sin(r[yaw])
      x, y = x * cz - y * sz, x * sz + y * cz
      y, z = y * cx - z * sx, y * sx + z * cx
      x, z = x * cy + z * sy, -x * sy + z * cy
      [x, y, z]
    end

    private

    # Where the line p + t d (in its own [u, h, v]) is inside it, for t from `from` to `to`, as
    # [from, to, by_face]: by_face when the stretch comes out through the top or bottom face.
    def stretches(p, d, from, to)
      lo = [from, -1e5].max
      hi = [to, 1e5].min
      face_end = false
      if d[1].abs > 1e-9
        a, b = (-@thickness - p[1]) / d[1], -p[1] / d[1]
        bottom, top = [a, b].minmax
        lo = bottom if bottom > lo
        hi = top if top < hi
        face_end = hi == top
      elsif p[1] > 0 || p[1] < -@thickness
        return []
      end
      return [] if hi - lo < 1e-9
      cuts = [lo, hi]
      if Math.hypot(d[0], d[2]) > 1e-9
        rings.each do |ring|
          ring.each_with_index do |a, i|
            t = crossing(p, d, a, ring[(i + 1) % ring.size])
            cuts << t if t && t > lo && t < hi
          end
        end
      end
      cuts.sort!
      out = []
      cuts.each_cons(2) do |t0, t1|
        next if t1 - t0 < 1e-6 || !inside?([p[0] + d[0] * (t0 + t1) / 2, p[2] + d[2] * (t0 + t1) / 2])
        if out.any? && (out.last[1] - t0).abs < 1e-6
          out.last[1] = t1
        else
          out << [t0, t1]
        end
      end
      out.map { |t0, t1| [t0, t1, face_end && (t1 - hi).abs < 1e-6] }
    end

    # A continent point in its own [u, h, v]: across its top face from `at`, and up from it.
    def local((x, y, z))
      deg = Math::PI / 180
      yaw, pitch, roll = @turn.map { -_1 * deg }
      u, h, v = x - @at[0], y - @at[1], z - @at[2]
      u, v = u * Math.cos(yaw) + v * Math.sin(yaw), -u * Math.sin(yaw) + v * Math.cos(yaw)
      h, v = h * Math.cos(pitch) - v * Math.sin(pitch), h * Math.sin(pitch) + v * Math.cos(pitch)
      u, h = u * Math.cos(roll) - h * Math.sin(roll), u * Math.sin(roll) + h * Math.cos(roll)
      [u, h, v]
    end

    def rings = [@outline, *@holes]

    def inside?(point) = in_polygon?(@outline, point) && @holes.none? { in_polygon?(_1, point) }

    def in_polygon?(polygon, (x, z))
      into = false
      polygon.each_with_index do |(x0, z0), i|
        x1, z1 = polygon[(i + 1) % polygon.size]
        into = !into if (z0 > z) != (z1 > z) && x < x0 + (z - z0) * (x1 - x0) / (z1 - z0)
      end
      into
    end

    # The edge of the outline or a hole nearest a point, as [a, b].
    def nearest_edge((u, v))
      rings.flat_map { |ring| ring.each_with_index.map { |a, i| [a, ring[(i + 1) % ring.size]] } }.min_by do |a, b|
        dx, dv = b[0] - a[0], b[1] - a[1]
        t = (((u - a[0]) * dx + (v - a[1]) * dv) / [dx * dx + dv * dv, 1e-12].max).clamp(0, 1)
        Math.hypot(u - a[0] - t * dx, v - a[1] - t * dv)
      end
    end

    # How far along the line from p in direction d (by their [0] and [2]) it crosses the edge a
    # to b, or nil.
    def crossing(p, d, a, b)
      ex, ez = b[0] - a[0], b[1] - a[1]
      cross = d[0] * ez - d[2] * ex
      return nil if cross.abs < 1e-12
      fx, fz = a[0] - p[0], a[1] - p[2]
      s = (fx * d[2] - fz * d[0]) / cross
      (fx * ez - fz * ex) / cross if s.between?(-1e-9, 1 + 1e-9)
    end

    def add(a, b) = a.zip(b).map(&:sum)

    def sub(a, b) = a.zip(b).map { _1 - _2 }
  end
end
