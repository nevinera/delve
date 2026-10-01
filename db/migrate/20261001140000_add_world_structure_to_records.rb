class AddWorldStructureToRecords < ActiveRecord::Migration[8.1]
  def change
    add_column :worlds, :name, :string
    add_column :world_versions, :name, :string
    add_column :zones, :entry_connection_key, :string
    add_column :zones, :links, :json, null: false, default: {}
  end
end
