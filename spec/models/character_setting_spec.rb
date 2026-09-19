require "rails_helper"

RSpec.describe CharacterSetting, type: :model do
  it "is valid with defaults" do
    setting = create(:character_setting)
    expect(setting.camera_sensitivity).to eq(1.0)
    expect(setting.ability_button_map).to eq({})
    expect(setting.custom_hotkeys).to eq({})
  end

  it "allows only one setting row per character" do
    setting = create(:character_setting)
    expect(build(:character_setting, character: setting.character)).not_to be_valid
  end

  it "requires a positive camera_sensitivity" do
    expect(build(:character_setting, camera_sensitivity: 0)).not_to be_valid
    expect(build(:character_setting, camera_sensitivity: nil)).not_to be_valid
    expect(build(:character_setting, camera_sensitivity: 1.5)).to be_valid
  end

  it "accepts an integer-to-integer ability_button_map" do
    expect(build(:character_setting, ability_button_map: {"0" => 3, "3" => 0})).to be_valid
  end

  it "rejects a malformed ability_button_map" do
    expect(build(:character_setting, ability_button_map: {"a" => 1})).not_to be_valid
    expect(build(:character_setting, ability_button_map: {"1" => "x"})).not_to be_valid
    expect(build(:character_setting, ability_button_map: [1, 2])).not_to be_valid
  end

  describe "custom_hotkeys" do
    def setting_with(hotkeys) = build(:character_setting, custom_hotkeys: hotkeys)

    it "accepts known actions bound to valid keys" do
      expect(setting_with({"ability_1" => "s+z", "move_forward" => "up", "toggle_latency" => "f5", "target_next" => "`"})).to be_valid
    end

    it "rejects an unknown action" do
      setting = setting_with({"fly" => "f"})
      expect(setting).not_to be_valid
      expect(setting.errors[:custom_hotkeys].join).to include("unknown action \"fly\"")
    end

    it "rejects an unbound (null) action" do
      expect(setting_with({"ability_1" => nil})).not_to be_valid
    end

    it "rejects malformed bindings" do
      ["", "L", "ctrl+a", "c+a", "s+", "ab", "shift+2", 1, "f25", "f0"].each do |binding|
        expect(setting_with({"ability_1" => binding})).not_to be_valid, "expected #{binding.inspect} to be rejected"
      end
    end

    it "rejects a non-hash" do
      expect(setting_with(["ability_1"])).not_to be_valid
    end
  end
end
