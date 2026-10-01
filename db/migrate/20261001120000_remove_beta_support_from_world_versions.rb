class RemoveBetaSupportFromWorldVersions < ActiveRecord::Migration[8.1]
  def change
    remove_index :world_versions, :share_token, unique: true
    remove_column :world_versions, :share_token, :string
    remove_column :world_versions, :ref_kind, :string, null: false, default: "tag"
  end
end
