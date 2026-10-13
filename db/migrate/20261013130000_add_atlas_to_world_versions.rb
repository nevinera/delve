# What the in-game map draws of the version's atlas, worked out at import
# (see WorldContent::Atlas); nil for a world with no atlas.
class AddAtlasToWorldVersions < ActiveRecord::Migration[8.1]
  def change
    add_column :world_versions, :atlas, :json
  end
end
