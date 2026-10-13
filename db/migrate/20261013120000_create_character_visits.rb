# Where a world character has been (plans/map-visits.md): zones, maps in
# them, and places on those maps, for the in-game map. A zone's visit has
# a blank map and place, a map's a blank place.
class CreateCharacterVisits < ActiveRecord::Migration[8.1]
  def change
    create_table :character_visits do |t|
      t.references :world_character, null: false, foreign_key: true, index: false
      t.references :world_version, foreign_key: {on_delete: :nullify}
      t.string :zone_identifier, null: false, limit: 64
      t.string :map_identifier, null: false, limit: 64, default: ""
      t.string :place_identifier, null: false, limit: 64, default: ""
      t.datetime :created_at, null: false
    end
    add_index :character_visits, [:world_character_id, :zone_identifier, :map_identifier, :place_identifier],
      unique: true, name: "index_character_visits_uniquely"
  end
end
