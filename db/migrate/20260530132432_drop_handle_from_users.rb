class DropHandleFromUsers < ActiveRecord::Migration[8.1]
  def change
    remove_index :users, :handle
    remove_column :users, :handle, :string
  end
end
