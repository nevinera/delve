# Per-character client preferences. Each setting is its own column (no
# free-form blob) so the set of available settings stays explicit.
class CharacterSetting < ApplicationRecord
  # One key, optionally shift-prefixed ("w", "5", "tab", "s+t"). Mirrors
  # keyToken in client/src/hotkeys.js.
  BINDING_FORMAT = /\A(s\+)?([a-z0-9]|tab|space|enter|backspace|up|down|left|right|f([1-9]|1\d|2[0-4])|[`\-=\[\]\\;',.\/])\z/

  belongs_to :character

  validates :character_id, uniqueness: true
  validates :camera_sensitivity, numericality: {greater_than: 0}
  validate :ability_button_map_is_integer_to_integer
  validate :custom_hotkeys_are_valid_bindings

  def as_client_json
    {
      cameraSensitivity: camera_sensitivity,
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

  # custom_hotkeys holds {action => binding} overrides on top of the client's
  # defaults. Every value must be a real binding: null (unbound) is not
  # allowed, so an action can never end up without a key.
  def custom_hotkeys_are_valid_bindings
    unless custom_hotkeys.is_a?(Hash)
      errors.add(:custom_hotkeys, "must map actions to bindings")
      return
    end
    custom_hotkeys.each do |action, binding|
      errors.add(:custom_hotkeys, "has unknown action #{action.inspect}") unless HotkeyActions.known?(action)
      errors.add(:custom_hotkeys, "has an invalid binding for #{action}") unless binding.is_a?(String) && binding.match?(BINDING_FORMAT)
    end
  end
end
