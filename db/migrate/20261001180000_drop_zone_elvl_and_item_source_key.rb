# zones.elvl was never read (the zone file is the source of truth at join),
# and character_items.source_key only ever restated zone_identifier,
# identifier, and version, which now carry the uniqueness themselves.
class DropZoneElvlAndItemSourceKey < ActiveRecord::Migration[8.1]
  def change
    remove_column :zones, :elvl, :integer

    remove_index :character_items, [:world_character_id, :source_key], unique: true
    remove_column :character_items, :source_key, :string, null: false
    add_index :character_items, [:world_character_id, :zone_identifier, :identifier, :version],
      unique: true, name: "index_character_items_on_identity"
  end
end
