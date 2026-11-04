class AddBuildToWorldCharacters < ActiveRecord::Migration[8.1]
  def change
    add_column :world_characters, :specialization, :string
    add_column :world_characters, :talents, :json, default: {}, null: false
  end
end
