class CreateWorldCharacters < ActiveRecord::Migration[8.1]
  def change
    create_table :world_characters do |t|
      t.references :world, null: false, foreign_key: true
      t.references :character, null: false, foreign_key: true
      t.references :world_version, null: true, foreign_key: true
      t.boolean :active, null: false, default: true
      t.string :zone_identifier
      t.string :connection_key
      t.string :rest_site
      t.datetime :last_played_at
      t.timestamps
    end
    add_index :world_characters, [:world_id, :character_id], unique: true
  end
end
