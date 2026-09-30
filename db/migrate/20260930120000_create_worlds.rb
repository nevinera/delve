class CreateWorlds < ActiveRecord::Migration[8.1]
  def up
    create_table :worlds do |t|
      t.string :identifier, null: false
      t.string :name, null: false
      t.text :description
      t.timestamps
    end
    add_index :worlds, :identifier, unique: true

    create_table :world_versions do |t|
      t.references :world, null: false, foreign_key: true
      t.string :version, null: false
      t.string :config_url, null: false
      t.string :content_sha
      t.string :state, null: false, default: "provided"
      t.string :validity_error
      t.references :registering_user, null: false, foreign_key: {to_table: :users}
      t.timestamps
    end
    add_index :world_versions, [:world_id, :version], unique: true
    add_index :world_versions, :state

    add_reference :zones, :world_version, foreign_key: true
    add_column :zones, :key, :string
    remove_index :zones, [:identifier, :version]
    add_index :zones, [:identifier, :version], where: "world_version_id IS NULL", unique: true, name: "index_zones_on_identifier_and_version_legacy"
    add_index :zones, [:world_version_id, :key], unique: true

    create_table :character_worlds do |t|
      t.references :character, null: false, foreign_key: true
      t.references :world, null: false, foreign_key: true
      t.string :zone_key
      t.string :map_id
      t.float :x
      t.float :y
      t.datetime :entered_at, null: false
      t.timestamps
    end
    add_index :character_worlds, [:character_id, :world_id], unique: true

    create_table :character_tags do |t|
      t.references :character_world, null: false, foreign_key: true
      t.string :name, null: false
      t.string :granted_version, null: false
      t.timestamps
    end
    add_index :character_tags, [:character_world_id, :name], unique: true

    add_reference :character_items, :world, foreign_key: true

    backfill
  end

  def down
    remove_reference :character_items, :world, foreign_key: true
    drop_table :character_tags
    drop_table :character_worlds
    remove_index :zones, [:world_version_id, :key]
    remove_index :zones, name: "index_zones_on_identifier_and_version_legacy"
    add_index :zones, [:identifier, :version], unique: true
    remove_column :zones, :key
    remove_reference :zones, :world_version, foreign_key: true
    drop_table :world_versions
    drop_table :worlds
  end

  private

  # Each existing zone becomes a one-zone world (keyed by the zone's own
  # identifier), so the direct-to-zone client keeps working unchanged.
  def backfill
    execute <<~SQL
      INSERT INTO worlds (identifier, name, description, created_at, updated_at)
      SELECT identifier, MIN(name), MIN(description), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM zones GROUP BY identifier
    SQL
    execute <<~SQL
      INSERT INTO world_versions (world_id, version, config_url, content_sha, state, validity_error, registering_user_id, created_at, updated_at)
      SELECT w.id, z.version, z.config_url, z.content_sha, z.state, z.validity_error, z.registering_user_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM zones z JOIN worlds w ON w.identifier = z.identifier
    SQL
    execute <<~SQL
      UPDATE zones SET key = identifier,
        world_version_id = (
          SELECT wv.id FROM world_versions wv JOIN worlds w ON w.id = wv.world_id
          WHERE w.identifier = zones.identifier AND wv.version = zones.version
        )
    SQL
    execute <<~SQL
      UPDATE character_items SET world_id = (SELECT w.id FROM worlds w WHERE w.identifier = character_items.zone_identifier)
    SQL
  end
end
