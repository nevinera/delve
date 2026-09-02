require "rails_helper"

RSpec.describe Content::Effect do
  describe ".from_h" do
    it "dispatches to the Harm subclass" do
      effect = described_class.from_h({"type" => "harm", "affects" => "bTarget", "amount" => 10.0, "range" => 5.0})
      expect(effect).to be_a(Content::Effect::Harm)
    end

    it "dispatches to the Heal subclass" do
      effect = described_class.from_h({"type" => "heal", "affects" => "self", "amount" => 10.0})
      expect(effect).to be_a(Content::Effect::Heal)
    end

    it "dispatches to the Resource subclass" do
      effect = described_class.from_h({"type" => "resource", "affects" => "self", "resourceName" => "energy", "delta" => 10.0})
      expect(effect).to be_a(Content::Effect::Resource)
    end

    it "dispatches to the Status subclass" do
      effect = described_class.from_h({"type" => "status", "affects" => "self", "duration" => 5.0, "status" => {}})
      expect(effect).to be_a(Content::Effect::Status)
    end

    it "raises for an unknown type" do
      expect { described_class.from_h({"type" => "bogus"}) }.to raise_error(ArgumentError)
    end
  end

  describe "#type" do
    it "derives the JSON type from the class name" do
      expect(Content::Effect::Harm.new.type).to eq("harm")
    end
  end
end
