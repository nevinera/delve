class RenameJoystickSensitivityOnCharacterSettings < ActiveRecord::Migration[8.1]
  def change
    rename_column :character_settings, :joystick_sensitivity, :camera_sensitivity
  end
end
