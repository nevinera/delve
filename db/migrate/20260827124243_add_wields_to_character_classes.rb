class AddWieldsToCharacterClasses < ActiveRecord::Migration[8.1]
  def change
    add_column :character_classes, :wields, :json, default: [], null: false
  end
end
