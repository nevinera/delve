require "rails_helper"

RSpec.describe AtlasGeometry do
  def square(x, y, size) = described_class.rect_corners(x, y, size, size)

  # A concave quad: its reflex corner at (1, 1).
  let(:concave) { [[0, 0], [4, 0], [1, 1], [0, 4]] }

  describe ".simple_quad?" do
    it "takes convex and concave quads" do
      expect(described_class.simple_quad?(square(0, 0, 2))).to be(true)
      expect(described_class.simple_quad?(concave)).to be(true)
    end

    it "refuses a bowtie, a flat quad, and the wrong number of points" do
      expect(described_class.simple_quad?([[0, 0], [2, 2], [2, 0], [0, 2]])).to be(false)
      expect(described_class.simple_quad?([[0, 0], [1, 0], [2, 0], [3, 0]])).to be(false)
      expect(described_class.simple_quad?([[0, 0], [1, 0], [1, 1]])).to be(false)
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

  describe ".quads_overlap?" do
    it "counts overlap, including the same quad twice and one inside another" do
      expect(described_class.quads_overlap?(square(0, 0, 2), square(1, 0, 2))).to be(true)
      expect(described_class.quads_overlap?(square(0, 0, 2), square(0, 0, 2))).to be(true)
      expect(described_class.quads_overlap?(square(0, 0, 4), square(1, 1, 1))).to be(true)
    end

    it "counts overlap along a shared edge's line" do
      expect(described_class.quads_overlap?(described_class.rect_corners(0, 0, 2, 1), described_class.rect_corners(1, 0, 2, 1))).to be(true)
    end

    it "doesn't count touching" do
      expect(described_class.quads_overlap?(square(0, 0, 2), square(2, 0, 2))).to be(false)
      expect(described_class.quads_overlap?(square(0, 0, 2), square(2, 2, 2))).to be(false)
    end

    it "looks into a concave quad's notch" do
      expect(described_class.quads_overlap?(concave, square(2, 2, 1))).to be(false)
      expect(described_class.quads_overlap?(concave, square(0.5, 0.5, 1))).to be(true)
    end
  end
end
