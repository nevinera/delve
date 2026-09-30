class CreateWorldsAndWorldVersions < ActiveRecord::Migration[8.1]
  def change
    create_table :worlds do |t|
      t.references :owner, null: false, foreign_key: {to_table: :users}
      t.string :repo, null: false
      t.string :path, null: false
      t.timestamps
    end
    add_index :worlds, [:repo, :path], unique: true

    create_table :world_versions do |t|
      t.references :world, null: false, foreign_key: true
      t.string :ref, null: false
      t.string :ref_kind, null: false
      t.string :commit_sha
      t.string :raw_base_url
      t.string :content_sha
      t.string :state, null: false, default: "importing"
      t.text :validity_error
      t.string :share_token
      t.datetime :imported_at
      t.datetime :released_at
      t.datetime :expires_at
      t.timestamps
    end
    add_index :world_versions, [:world_id, :ref], unique: true
    add_index :world_versions, [:world_id, :state]
    add_index :world_versions, :share_token, unique: true

    add_reference :zones, :world_version, null: true, foreign_key: true
    add_column :zones, :path, :string
    change_column_null :zones, :version, true
    change_column_null :zones, :config_url, true
    change_column_null :zones, :registering_user_id, true
    change_column_null :zones, :name, true
    add_index :zones, [:world_version_id, :identifier], unique: true
  end
end
