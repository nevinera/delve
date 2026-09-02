require "rails_helper"

RSpec.describe Build::AbilitiesHelper, type: :helper do
  describe "#scalar_fields" do
    it "keeps only non-array values" do
      hash = {"name" => "Punch", "castTime" => nil, "graphicEffects" => [{"a" => 1}]}
      expect(helper.scalar_fields(hash)).to eq({"name" => "Punch", "castTime" => nil})
    end
  end

  describe "#list_fields" do
    it "keeps only array values" do
      hash = {"name" => "Punch", "graphicEffects" => [{"a" => 1}], "soundEffects" => []}
      expect(helper.list_fields(hash)).to eq({"graphicEffects" => [{"a" => 1}], "soundEffects" => []})
    end
  end

  describe "#field_label" do
    it "humanizes a camelCase key" do
      expect(helper.field_label("globalCooldown")).to eq("Global cooldown")
    end

    it "humanizes an already-lowercase key" do
      expect(helper.field_label("name")).to eq("Name")
    end
  end

  describe "#entry_summary" do
    it "prefers the type field as a hint" do
      expect(helper.entry_summary({"type" => "harm"}, 0)).to eq("1. harm")
    end

    it "falls back to the when field as a hint" do
      expect(helper.entry_summary({"when" => "impact"}, 2)).to eq("3. impact")
    end

    it "falls back to a bare index when there's no hint" do
      expect(helper.entry_summary({}, 4)).to eq("5")
    end
  end

  describe "#asset_media_kind" do
    it "returns :image when the key ends with URL and an image data uri is available" do
      thumbnails = {"../graphics/icons/punch.svg" => "data:image/svg+xml;base64,abc"}
      expect(helper.asset_media_kind("iconURL", "../graphics/icons/punch.svg", thumbnails)).to eq(:image)
    end

    it "returns :audio when the data uri is an audio type" do
      thumbnails = {"../audio/punch.ogg" => "data:audio/ogg;base64,abc"}
      expect(helper.asset_media_kind("sourceURL", "../audio/punch.ogg", thumbnails)).to eq(:audio)
    end

    it "returns nil when the key doesn't end with URL" do
      thumbnails = {"../audio/punch.ogg" => "data:audio/ogg;base64,abc"}
      expect(helper.asset_media_kind("duration", "../audio/punch.ogg", thumbnails)).to be_nil
    end

    it "returns nil when there's no thumbnail for the value" do
      expect(helper.asset_media_kind("sourceURL", "../audio/punch.ogg", {})).to be_nil
    end

    it "returns :sprite for a sourceURL entry with sprite dimensions" do
      thumbnails = {"../graphics/animations/firebolt.sprites2x2.png" => "data:image/png;base64,abc"}
      entry = {"sourceURL" => "../graphics/animations/firebolt.sprites2x2.png", "spriteColumns" => 2, "spriteRows" => 2}
      expect(helper.asset_media_kind("sourceURL", entry["sourceURL"], thumbnails, entry)).to eq(:sprite)
    end

    it "returns :image (not :sprite) for iconURL even if sibling sprite fields are present" do
      thumbnails = {"../graphics/icons/firebolt.svg" => "data:image/svg+xml;base64,abc"}
      entry = {"iconURL" => "../graphics/icons/firebolt.svg", "spriteColumns" => 2, "spriteRows" => 2}
      expect(helper.asset_media_kind("iconURL", entry["iconURL"], thumbnails, entry)).to eq(:image)
    end
  end

  describe "#sprite_preview_tag" do
    it "renders a keyframe animation stepping through every frame of the grid" do
      entry = {"spriteColumns" => 2, "spriteRows" => 2, "spriteFrameRate" => 8}
      html = helper.sprite_preview_tag("data:image/png;base64,abc", entry)

      expect(html).to include("<style>")
      expect(html).to include("@keyframes")
      expect(html).to include("background-position: 0.0% 0.0%")
      expect(html).to include("background-position: 100.0% 0.0%")
      expect(html).to include("background-position: 0.0% 100.0%")
      expect(html).to include("background-position: 100.0% 100.0%")
      expect(html).to include("background-size: 200% 200%")
      expect(html).to include("background-image: url('data:image/png;base64,abc')")
      expect(html).to include('<div class="asset-thumbnail sprite-')
    end

    it "derives a frame rate from frameCount/duration when spriteFrameRate is absent" do
      entry = {"spriteColumns" => 2, "spriteRows" => 1, "duration" => 0.5}
      html = helper.sprite_preview_tag("data:image/png;base64,abc", entry)
      expect(html).to include("0.5s steps(1) infinite")
    end
  end

  describe "#format_value" do
    it "renders nil as an em dash" do
      expect(helper.format_value(nil)).to eq("—")
    end

    it "renders booleans as their string form" do
      expect(helper.format_value(true)).to eq("true")
      expect(helper.format_value(false)).to eq("false")
    end

    it "joins array elements with a comma" do
      expect(helper.format_value(["physical", "melee"])).to eq("physical, melee")
    end

    it "joins nested hash fields with humanized labels" do
      expect(helper.format_value({"resourceName" => "energy", "delta" => 10.0})).to eq("Resource name: energy; Delta: 10.0")
    end

    it "stringifies plain scalars" do
      expect(helper.format_value(1.5)).to eq("1.5")
      expect(helper.format_value("harm")).to eq("harm")
    end
  end
end
