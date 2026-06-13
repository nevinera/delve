class AddTokenUrlToCharacters < ActiveRecord::Migration[8.1]
  def change
    add_column :characters, :token_url, :string, null: false
  end
end
