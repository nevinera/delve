require "rails_helper"

RSpec.describe CharacterSetting, type: :model do
  it "is valid with defaults" do
    setting = create(:character_setting)
    expect(setting.joystick_sensitivity).to eq(1.0)
    expect(setting.ability_button_map).to eq({})
    expect(setting.custom_hotkeys).to eq({})
  end

  it "allows only one setting row per character" do
    setting = create(:character_setting)
    expect(build(:character_setting, character: setting.character)).not_to be_valid
  end

  it "requires a positive joystick_sensitivity" do
    expect(build(:character_setting, joystick_sensitivity: 0)).not_to be_valid
    expect(build(:character_setting, joystick_sensitivity: nil)).not_to be_valid
    expect(build(:character_setting, joystick_sensitivity: 1.5)).to be_valid
  end

  it "accepts an integer-to-integer ability_button_map" do
    expect(build(:character_setting, ability_button_map: {"0" => 3, "3" => 0})).to be_valid
  end

  it "rejects a malformed ability_button_map" do
    expect(build(:character_setting, ability_button_map: {"a" => 1})).not_to be_valid
    expect(build(:character_setting, ability_button_map: {"1" => "x"})).not_to be_valid
    expect(build(:character_setting, ability_button_map: [1, 2])).not_to be_valid
  end

  it "accepts a string-to-string custom_hotkeys" do
    expect(build(:character_setting, custom_hotkeys: {"L" => "ability_1", "shift+2" => "move_forward"})).to be_valid
  end

  it "rejects a malformed custom_hotkeys" do
    expect(build(:character_setting, custom_hotkeys: {"L" => 1})).not_to be_valid
    expect(build(:character_setting, custom_hotkeys: {"" => "ability_1"})).not_to be_valid
    expect(build(:character_setting, custom_hotkeys: ["L"])).not_to be_valid
  end
end
