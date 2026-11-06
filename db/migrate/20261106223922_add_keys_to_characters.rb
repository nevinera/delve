class AddKeysToCharacters < ActiveRecord::Migration[8.1]
  def change
    # The play keys a character has changed from the defaults: { action id => key combo }.
    add_column :characters, :keys, :json, default: {}, null: false
  end
end
