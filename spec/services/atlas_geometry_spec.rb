require "rails_helper"

RSpec.describe AtlasGeometry do
  def square(x, y, size) = described_class.rect_corners(x, y, size, size)

  # A concave quad: its reflex corner at (1, 1).
  let(:concave) { [[0, 0], [4, 0], [1, 1], [0, 4]] }

  # An L: a 4x4 square missing its north-east 2x2.
  let(:ell) { [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]] }

  describe ".simple_polygon?" do
    it "takes triangles, convex and concave polygons, and a vertex in the middle of an edge" do
      expect(described_class.simple_polygon?([[0, 0], [1, 0], [1, 1]])).to be(true)
      expect(described_class.simple_polygon?(square(0, 0, 2))).to be(true)
      expect(described_class.simple_polygon?(concave)).to be(true)
      expect(described_class.simple_polygon?(ell)).to be(true)
      expect(described_class.simple_polygon?([[0, 0], [1, 0], [2, 0], [2, 2], [0, 2]])).to be(true)
    end

    it "refuses a bowtie, a flat polygon, too few points, a repeated point and doubling back" do
      expect(described_class.simple_polygon?([[0, 0], [2, 2], [2, 0], [0, 2]])).to be(false)
      expect(described_class.simple_polygon?([[0, 0], [1, 0], [2, 0], [3, 0]])).to be(false)
      expect(described_class.simple_polygon?([[0, 0], [1, 0]])).to be(false)
      expect(described_class.simple_polygon?([[0, 0], [2, 0], [2, 0], [2, 2], [0, 2]])).to be(false)
      expect(described_class.simple_polygon?([[0, 0], [2, 0], [1, 0], [1, 2]])).to be(false)
    end

    it "refuses an outline that touches itself" do
      expect(described_class.simple_polygon?([[0, 0], [4, 0], [4, 4], [2, 0.0], [0, 4]])).to be(false)
    end
  end

  describe ".triangles" do
    it "covers a concave polygon's area exactly, either way round" do
      [ell, ell.reverse].each do |polygon|
        area = described_class.triangles(polygon).sum { |t| described_class.signed_area(t).abs }
        expect(area).to be_within(1e-9).of(12)
      end
    end
  end

  describe ".rect_inside?" do
    it "takes a rect inside, or filling, the quad" do
      expect(described_class.rect_inside?(square(0.5, 0.5, 1), square(0, 0, 2))).to be(true)
      expect(described_class.rect_inside?(square(0, 0, 2), square(0, 0, 2))).to be(true)
    end

    it "refuses a rect over the edge" do
      expect(described_class.rect_inside?(square(1, 1, 2), square(0, 0, 2))).to be(false)
    end

    it "takes a rect in one arm of an L, not one across its notch" do
      expect(described_class.rect_inside?(square(0, 0, 2), ell)).to be(true)
      expect(described_class.rect_inside?(square(1, 1, 2), ell)).to be(false)
    end

    it "refuses a rect with a concave quad's corner poking into it" do
      expect(described_class.rect_inside?(square(0.1, 0.1, 1.5), concave)).to be(false)
      expect(described_class.rect_inside?(square(0.1, 0.1, 0.5), concave)).to be(true)
    end
  end

  describe ".rects_overlap?" do
    it "counts overlap, not touching" do
      expect(described_class.rects_overlap?(square(0, 0, 2), square(1, 1, 2))).to be(true)
      expect(described_class.rects_overlap?(square(0, 0, 2), square(2, 0, 2))).to be(false)
      expect(described_class.rects_overlap?(square(0, 0, 2), square(2, 2, 2))).to be(false)
    end
  end

  describe ".polygons_overlap?" do
    it "counts overlap, including the same quad twice and one inside another" do
      expect(described_class.polygons_overlap?(square(0, 0, 2), square(1, 0, 2))).to be(true)
      expect(described_class.polygons_overlap?(square(0, 0, 2), square(0, 0, 2))).to be(true)
      expect(described_class.polygons_overlap?(square(0, 0, 4), square(1, 1, 1))).to be(true)
    end

    it "counts overlap along a shared edge's line" do
      expect(described_class.polygons_overlap?(described_class.rect_corners(0, 0, 2, 1), described_class.rect_corners(1, 0, 2, 1))).to be(true)
    end

    it "doesn't count touching" do
      expect(described_class.polygons_overlap?(square(0, 0, 2), square(2, 0, 2))).to be(false)
      expect(described_class.polygons_overlap?(square(0, 0, 2), square(2, 2, 2))).to be(false)
    end

    it "looks into an L's notch" do
      expect(described_class.polygons_overlap?(ell, square(2, 2, 2))).to be(false)
      expect(described_class.polygons_overlap?(ell, square(1, 1, 2))).to be(true)
    end

    it "looks into a concave quad's notch" do
      expect(described_class.polygons_overlap?(concave, square(2, 2, 1))).to be(false)
      expect(described_class.polygons_overlap?(concave, square(0.5, 0.5, 1))).to be(true)
    end
  end
end
