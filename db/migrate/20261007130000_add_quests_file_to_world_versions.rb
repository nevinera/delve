class AddQuestsFileToWorldVersions < ActiveRecord::Migration[8.1]
  def change
    add_column :world_versions, :quests_path, :string
    add_column :world_versions, :quests_sha, :string
  end
end
