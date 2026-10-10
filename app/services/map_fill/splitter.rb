class MapFill
  # Breaks every segment where another crosses or touches it.
  class Splitter
    include Geometry

    PAD = 1e-6 # feet, around each segment's bounding box

    def self.call(segments) = new(segments).pieces

    def initialize(segments)
      @segments = segments
      @cuts = segments.map { [0.0, 1.0] }
      @boxes = segments.map { |s| box(s) }
    end

    def pieces
      @segments.each_index { |i| cut_against_later(i) }
      @segments.each_with_index.flat_map { |s, i| pieces_of(s, @cuts[i]) }
    end

    private

    def cut_against_later(i)
      ((i + 1)...@segments.length).each do |j|
        next unless overlap?(@boxes[i], @boxes[j])
        crossings(@segments[i], @segments[j]).each do |ti, tj|
          @cuts[i] << ti
          @cuts[j] << tj
        end
      end
    end

    def pieces_of(s, cuts)
      cuts.uniq.sort.each_cons(2).filter_map do |t0, t1|
        a, b = lerp(s.a, s.b, t0), lerp(s.a, s.b, t1)
        Piece.new(a, b, s.kind, s.identifier) if dist(a, b) > MERGE
      end
    end

    def box(s)
      (x0, x1), (y0, y1) = [s.a[0], s.b[0]].minmax, [s.a[1], s.b[1]].minmax
      [x0 - PAD, y0 - PAD, x1 + PAD, y1 + PAD]
    end

    def overlap?(p, q) = p[0] <= q[2] && q[0] <= p[2] && p[1] <= q[3] && q[1] <= p[3]

    # [t on s, t on r] pairs where the two meet: one crossing, or for
    # overlapping collinear segments, each one's ends on the other.
    def crossings(s, r)
      d1, d2 = direction(s), direction(r)
      denom = cross(d1, d2)
      return collinear(s, r) if denom.abs <= 1e-9 * Math.hypot(*d1) * Math.hypot(*d2)
      proper_crossing(s, r, d1, d2, denom)
    end

    def proper_crossing(s, r, d1, d2, denom)
      w = sub(r.a, s.a)
      t = cross(w, d2) / denom
      u = cross(w, d1) / denom
      return [] unless within?(t, d1) && within?(u, d2)
      [[t.clamp(0.0, 1.0), u.clamp(0.0, 1.0)]]
    end

    def within?(t, d) = t.between?(-1e-6 / Math.hypot(*d), 1 + 1e-6 / Math.hypot(*d))

    def collinear(s, r)
      return [] unless on_line?(r.a, s)
      ends_on(s, r) + ends_on(r, s).map(&:reverse)
    end

    # [t on s, t on r] for each of r's ends that falls within s.
    def ends_on(s, r)
      [r.a, r.b].filter_map do |p|
        t = param(p, s)
        [t.clamp(0.0, 1.0), param(p, r).clamp(0.0, 1.0)] if t > -EPS && t < 1 + EPS
      end
    end

    def direction(s) = sub(s.b, s.a)

    def param(p, s)
      d = direction(s)
      dot(sub(p, s.a), d) / dot(d, d)
    end

    def on_line?(p, s)
      d = direction(s)
      cross(sub(p, s.a), d).abs <= 1e-6 * Math.hypot(*d)
    end
  end
end
