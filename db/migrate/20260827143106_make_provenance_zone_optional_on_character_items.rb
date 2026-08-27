class MakeProvenanceZoneOptionalOnCharacterItems < ActiveRecord::Migration[8.1]
  def change
    change_column_null :character_items, :provenance_zone_id, true
  end
end
