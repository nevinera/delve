require "rails_helper"

RSpec.describe Content::StockAssets do
  {
    "icons" => Content::StockAssets::ICONS,
    "graphics" => Content::StockAssets::GRAPHICS,
    "sounds" => Content::StockAssets::SOUNDS
  }.each do |dir, entries|
    describe "#{dir.upcase} entries" do
      entries.each do |name, meta|
        it "#{name.inspect} points at a real file under public/abilities/#{dir}" do
          path = Rails.public_path.join("abilities", dir, meta.fetch("file"))
          expect(File.exist?(path)).to be(true), "expected #{path} to exist"
        end
      end
    end
  end

  # Reads width/height straight out of the PNG header (bytes 16-23 of the
  # IHDR chunk) rather than pulling in an image-dimension gem for one spec.
  def png_dimensions(path)
    bytes = File.open(path, "rb") { |f| f.read(24) }
    bytes[16, 4].unpack1("N").then { |w| [w, bytes[20, 4].unpack1("N")] }
  end

  describe "graphic sprite dimensions" do
    Content::StockAssets::GRAPHICS.each do |name, meta|
      next unless meta["spriteColumns"]

      it "#{name.inspect}'s file dimensions divide evenly by its spriteColumns/spriteRows" do
        path = Rails.public_path.join("abilities", "graphics", meta.fetch("file"))
        width, height = png_dimensions(path)
        expect(width % meta["spriteColumns"]).to eq(0), "#{meta["file"]} width #{width} isn't divisible by #{meta["spriteColumns"]} columns"
        expect(height % meta["spriteRows"]).to eq(0), "#{meta["file"]} height #{height} isn't divisible by #{meta["spriteRows"]} rows"
      end
    end
  end

  describe ".icon?/.graphic?/.sound?" do
    it "recognizes a known name in each list and rejects unknown names" do
      expect(Content::StockAssets.icon?("heal")).to be(true)
      expect(Content::StockAssets.graphic?("arc")).to be(true)
      expect(Content::StockAssets.sound?("twang")).to be(true)
      expect(Content::StockAssets.icon?("nonexistent")).to be(false)
      expect(Content::StockAssets.graphic?("nonexistent")).to be(false)
      expect(Content::StockAssets.sound?("nonexistent")).to be(false)
    end
  end
end
