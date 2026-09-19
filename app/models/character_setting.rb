# Per-character client preferences. Each setting is its own column (no
# free-form blob) so the set of available settings stays explicit.
class CharacterSetting < ApplicationRecord
  belongs_to :character

  validates :character_id, uniqueness: true
  validates :joystick_sensitivity, numericality: {greater_than: 0}
  validate :ability_button_map_is_integer_to_integer
  validate :custom_hotkeys_is_string_to_string

  def as_client_json
    {
      joystickSensitivity: joystick_sensitivity,
      abilityButtonMap: ability_button_map,
      customHotkeys: custom_hotkeys
    }
  end

  private

  def ability_button_map_is_integer_to_integer
    return if ability_button_map.is_a?(Hash) &&
      ability_button_map.all? { |k, v| k.to_s.match?(/\A\d+\z/) && v.is_a?(Integer) }
    errors.add(:ability_button_map, "must map integers to integers")
  end

  def custom_hotkeys_is_string_to_string
    return if custom_hotkeys.is_a?(Hash) &&
      custom_hotkeys.all? { |k, v| k.is_a?(String) && k.present? && v.is_a?(String) && v.present? }
    errors.add(:custom_hotkeys, "must map hotkey strings to binding strings")
  end
end
