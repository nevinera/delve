class AddClassToWorldCharacters < ActiveRecord::Migration[8.1]
  def change
    add_column :world_characters, :class_id, :string
    change_column_null :world_characters, :continent, true
    change_column_null :world_characters, :x, true
    change_column_null :world_characters, :y, true
    change_column_null :world_characters, :z, true
  end
end
