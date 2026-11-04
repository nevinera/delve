class AddBarsToWorldCharacters < ActiveRecord::Migration[8.1]
  def change
    add_column :world_characters, :bars, :json
  end
end
