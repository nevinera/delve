# An item's provenance is its world (via the world character) and the world
# version it was acquired in - not the zone it dropped in. Existing items
# are attributed to their world character's current version (the version
# they were acquired in wasn't recorded); trainee gear has no version.
#
# Identity becomes (world character, identifier, definition version), so
# copies of one item held from different zones collapse into one: the
# equipped copy is kept if there is one, otherwise the oldest.
class ItemProvenanceByWorldVersion < ActiveRecord::Migration[8.1]
  def up
    add_reference :character_items, :world_version, foreign_key: {on_delete: :nullify}

    execute <<~SQL
      UPDATE character_items
      SET world_version_id = (
        SELECT world_version_id FROM world_characters WHERE world_characters.id = character_items.world_character_id
      )
      WHERE zone_identifier != 'trainee'
    SQL

    execute "CREATE TEMPORARY TABLE duplicate_character_items AS #{duplicate_ids_sql}"
    execute "DELETE FROM equipped_items WHERE character_item_id IN (SELECT id FROM duplicate_character_items)"
    execute "DELETE FROM character_items WHERE id IN (SELECT id FROM duplicate_character_items)"
    execute "DROP TABLE duplicate_character_items"

    remove_index :character_items, name: "index_character_items_on_identity"
    remove_column :character_items, :zone_identifier
    add_index :character_items, [:world_character_id, :identifier, :version], unique: true, name: "index_character_items_on_identity"
  end

  # The zones items dropped in aren't recoverable, nor are collapsed copies.
  def down
    remove_index :character_items, name: "index_character_items_on_identity"
    add_column :character_items, :zone_identifier, :string, null: false, default: "unknown"
    execute "UPDATE character_items SET zone_identifier = 'trainee' WHERE world_version_id IS NULL"
    change_column_default :character_items, :zone_identifier, from: "unknown", to: nil
    add_index :character_items, [:world_character_id, :zone_identifier, :identifier, :version], unique: true, name: "index_character_items_on_identity"
    remove_reference :character_items, :world_version, foreign_key: true
  end

  private

  # Every copy but the one to keep per (world character, identifier,
  # version): equipped copies first, then oldest.
  def duplicate_ids_sql
    <<~SQL
      SELECT id FROM (
        SELECT character_items.id, ROW_NUMBER() OVER (
          PARTITION BY character_items.world_character_id, character_items.identifier, character_items.version
          ORDER BY (equipped_items.id IS NULL), character_items.id
        ) AS position
        FROM character_items
        LEFT JOIN equipped_items ON equipped_items.character_item_id = character_items.id
      ) WHERE position > 1
    SQL
  end
end
