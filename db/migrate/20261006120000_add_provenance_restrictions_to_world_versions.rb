class AddProvenanceRestrictionsToWorldVersions < ActiveRecord::Migration[8.1]
  def change
    add_column :world_versions, :provenance_restrictions, :json
  end
end
