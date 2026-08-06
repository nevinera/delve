class AddVersionToCharacterItems < ActiveRecord::Migration[8.1]
  def change
    add_column :character_items, :version, :string

    # Backfill from source_key, which is structured as "zone_identifier/version/item_identifier"
    CharacterItem.find_each do |item|
      version = item.source_key&.split("/")&.second
      item.update_columns(version: version) if version
    end

    change_column_null :character_items, :version, false
  end
end
