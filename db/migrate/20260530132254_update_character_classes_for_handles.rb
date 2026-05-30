class UpdateCharacterClassesForHandles < ActiveRecord::Migration[8.1]
  def change
    add_reference :character_classes, :handle, null: false, foreign_key: true
    remove_index :character_classes, :identifier
    add_index :character_classes, [:handle_id, :identifier], unique: true
  end
end
