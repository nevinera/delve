class RemoveIconUrlFromCharacterItems < ActiveRecord::Migration[8.1]
  def change
    remove_column :character_items, :icon_url, :string
  end
end
