class AddReleaseToWorlds < ActiveRecord::Migration[8.1]
  def change
    add_column :worlds, :released_tag, :string
    add_column :worlds, :released_at, :datetime
  end
end
