class AddLevelToWorldCharacters < ActiveRecord::Migration[8.1]
  def change
    add_column :world_characters, :level, :integer, default: 1, null: false
  end
end
