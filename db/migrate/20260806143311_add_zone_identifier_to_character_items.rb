class AddZoneIdentifierToCharacterItems < ActiveRecord::Migration[8.1]
  def change
    add_column :character_items, :zone_identifier, :string

    # Backfill from the provenance zone
    CharacterItem.find_each do |item|
      item.update_columns(zone_identifier: item.provenance_zone.identifier)
    end

    change_column_null :character_items, :zone_identifier, false
  end
end
