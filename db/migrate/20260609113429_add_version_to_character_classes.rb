class AddVersionToCharacterClasses < ActiveRecord::Migration[8.1]
  def change
    add_column :character_classes, :version, :string, null: false
    remove_index :character_classes, [:handle_id, :identifier]
    add_index :character_classes, [:handle_id, :identifier, :version], unique: true
  end
end
