class CreateCharacterSettings < ActiveRecord::Migration[8.1]
  def change
    create_table :character_settings do |t|
      t.references :character, null: false, foreign_key: true, index: {unique: true}
      t.float :joystick_sensitivity, null: false, default: 1.0
      t.json :ability_button_map, null: false, default: {}
      t.json :custom_hotkeys, null: false, default: {}

      t.timestamps
    end
  end
end
