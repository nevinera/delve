# Columns nothing reads any more (or that nothing ever wrote). Add them back
# when something needs them.
class DropDeadColumns < ActiveRecord::Migration[8.1]
  def change
    remove_index :zones, :state
    remove_column :zones, :state, :string, null: false, default: "provided"
    remove_column :zones, :validity_error, :string
    remove_column :zones, :file_size, :integer
    remove_column :world_versions, :content_sha, :string
    remove_column :characters, :time_logged, :integer, null: false, default: 0
    remove_column :characters, :last_played_at, :datetime
    remove_column :character_items, :received_at, :datetime, null: false
    remove_column :world_characters, :rest_site, :string
  end
end
