# The actions a keyboard binding can be attached to. Shared with the game
# client through config/hotkey_actions.json so both sides agree on the names.
module HotkeyActions
  ALL = JSON.parse(Rails.root.join("config/hotkey_actions.json").read).freeze
  IDS = ALL.map { |action| action.fetch("id") }.freeze

  def self.known?(id) = IDS.include?(id)
end
