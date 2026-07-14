class CreateCharacterItems < ActiveRecord::Migration[8.1]
  def change
    create_table :character_items do |t|
      t.references :character, null: false, foreign_key: true
      t.references :provenance_zone, null: false, foreign_key: {to_table: :zones}
      t.string :source_key, null: false
      t.string :identifier, null: false
      t.datetime :received_at, null: false

      t.string :name, null: false
      t.text :description
      t.string :icon_url
      t.integer :ilvl, null: false
      t.string :slot, null: false

      t.integer :strength
      t.integer :agility
      t.integer :intellect
      t.integer :stamina
      t.integer :crit_rating
      t.integer :haste_rating
      t.integer :mastery_rating
      t.integer :versatility_rating
      t.integer :resilience_rating
      t.decimal :weapon_dps, precision: 6, scale: 2

      t.json :source_json, null: false, default: {}

      t.timestamps
    end

    add_index :character_items, [:character_id, :source_key], unique: true
  end
end
