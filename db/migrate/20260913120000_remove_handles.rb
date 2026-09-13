class RemoveHandles < ActiveRecord::Migration[8.1]
  def change
    remove_foreign_key :character_classes, :handles
    remove_foreign_key :zones, :handles

    remove_index :character_classes, name: "idx_on_handle_id_identifier_version_b6e2d417bf"
    remove_index :character_classes, name: "index_character_classes_on_handle_id"
    remove_column :character_classes, :handle_id, :integer, null: false
    add_index :character_classes, [:identifier, :version], unique: true

    remove_index :zones, name: "index_zones_on_handle_id"
    remove_column :zones, :handle_id, :integer, null: false

    drop_table :handles do |t|
      t.datetime "created_at", null: false
      t.text "description"
      t.string "identifier", null: false
      t.datetime "updated_at", null: false
      t.integer "user_id", null: false
      t.index ["identifier"], name: "index_handles_on_identifier", unique: true
      t.index ["user_id"], name: "index_handles_on_user_id"
    end
  end
end
