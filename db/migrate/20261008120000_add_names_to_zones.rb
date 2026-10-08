# The display names quest logs need for zones other than the one a player
# is in, extracted at import so they're read without fetching zone files.
class AddNamesToZones < ActiveRecord::Migration[8.1]
  def change
    add_column :zones, :name, :string
    add_column :zones, :map_names, :json, default: {}, null: false
  end
end
