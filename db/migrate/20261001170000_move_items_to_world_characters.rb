# Items and equipment belong to a character's time in one world now (worlds
# slice 4), not to the character. Existing items are wiped.
class MoveItemsToWorldCharacters < ActiveRecord::Migration[8.1]
  def up
    execute "DELETE FROM equipped_items"
    execute "DELETE FROM character_items"

    remove_index :equipped_items, [:character_id, :equipped_slot]
    remove_reference :equipped_items, :character, foreign_key: true, index: true
    add_reference :equipped_items, :world_character, null: false, foreign_key: true
    add_index :equipped_items, [:world_character_id, :equipped_slot], unique: true

    remove_index :character_items, [:character_id, :source_key]
    remove_reference :character_items, :character, foreign_key: true, index: true
    remove_reference :character_items, :provenance_zone, foreign_key: {to_table: :zones}, index: true
    add_reference :character_items, :world_character, null: false, foreign_key: true
    add_index :character_items, [:world_character_id, :source_key], unique: true
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end
