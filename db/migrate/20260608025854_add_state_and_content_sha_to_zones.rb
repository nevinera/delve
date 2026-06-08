class AddStateAndContentShaToZones < ActiveRecord::Migration[8.1]
  def change
    add_column :zones, :state, :string, null: false, default: "provided"
    add_column :zones, :content_sha, :string
    add_index :zones, :state
  end
end
