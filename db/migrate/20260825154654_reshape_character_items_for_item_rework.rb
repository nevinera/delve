class ReshapeCharacterItemsForItemRework < ActiveRecord::Migration[8.1]
  def change
    rename_column :character_items, :ilvl, :elvl

    remove_column :character_items, :strength, :integer
    remove_column :character_items, :agility, :integer
    remove_column :character_items, :intellect, :integer
    remove_column :character_items, :stamina, :integer
    remove_column :character_items, :crit_rating, :integer
    remove_column :character_items, :haste_rating, :integer
    remove_column :character_items, :mastery_rating, :integer
    remove_column :character_items, :versatility_rating, :integer
    remove_column :character_items, :resilience_rating, :integer
    remove_column :character_items, :weapon_dps, :decimal, precision: 6, scale: 2

    add_column :character_items, :primary_stat, :string
    add_column :character_items, :secondary_stats, :json, null: false, default: []
  end
end
