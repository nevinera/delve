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
