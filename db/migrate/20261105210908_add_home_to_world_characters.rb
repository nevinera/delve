class AddHomeToWorldCharacters < ActiveRecord::Migration[8.1]
  def change
    add_column :world_characters, :home, :string
  end
end
