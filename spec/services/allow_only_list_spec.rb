require "rails_helper"

RSpec.describe AllowOnlyList do
  before do
    @dir = Dir.mktmpdir
    @path = Pathname.new(@dir).join("allow_only.yml")
    stub_const("AllowOnlyList::PATH", @path)
  end

  after { FileUtils.remove_entry(@dir) }

  context "when config/allow_only.yml does not exist" do
    it "allows any value for any key" do
      expect(described_class.allows?("google", "anyone@example.com")).to eq(true)
      expect(described_class.allows?("github", "anyone")).to eq(true)
    end
  end

  context "when config/allow_only.yml exists" do
    before { @path.write({"google" => ["allowed@example.com"], "github" => []}.to_yaml) }

    it "restricts a key with entries to those entries" do
      expect(described_class.allows?("google", "allowed@example.com")).to eq(true)
      expect(described_class.allows?("google", "other@example.com")).to eq(false)
    end

    it "allows everyone for a key with an empty list" do
      expect(described_class.allows?("github", "anyone")).to eq(true)
    end

    it "allows everyone for a key that's absent entirely" do
      expect(described_class.allows?("missing_key", "anyone")).to eq(true)
    end
  end
end
