class CreateCharacterFlags < ActiveRecord::Migration[8.1]
  def change
    create_table :character_flags do |t|
      t.references :world_character, null: false, foreign_key: true, index: false
      t.references :world_version, foreign_key: {on_delete: :nullify}
      t.string :flag_type, null: false
      t.string :identifier, null: false, limit: 64
      t.datetime :created_at, null: false
    end
    add_index :character_flags, [:world_character_id, :flag_type, :identifier], unique: true,
      name: "index_character_flags_uniquely"
  end
end
