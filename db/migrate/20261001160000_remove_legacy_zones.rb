# Hand-registered zones are gone (worlds slice 5): delete them, and the
# columns only they used. Every remaining zone belongs to a world version.
class RemoveLegacyZones < ActiveRecord::Migration[8.1]
  def up
    legacy = "SELECT id FROM zones WHERE world_version_id IS NULL"
    execute "UPDATE character_items SET provenance_zone_id = NULL WHERE provenance_zone_id IN (#{legacy})"
    execute "DELETE FROM slot_sessions WHERE zone_id IN (#{legacy})"
    execute "DELETE FROM zones WHERE world_version_id IS NULL"

    remove_index :zones, [:identifier, :version]
    remove_reference :zones, :registering_user, foreign_key: {to_table: :users}, index: true
    remove_columns :zones, :version, :config_url, :name, :description
    change_column_null :zones, :world_version_id, false
    change_column_null :zones, :path, false
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end
