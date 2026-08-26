class AddStatRanksToCharacterClasses < ActiveRecord::Migration[8.1]
  def change
    add_column :character_classes, :primary_stats, :json, default: [], null: false
    add_column :character_classes, :secondary_stats, :json, default: [], null: false
  end
end
