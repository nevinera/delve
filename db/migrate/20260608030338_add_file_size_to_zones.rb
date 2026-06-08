class AddFileSizeToZones < ActiveRecord::Migration[8.1]
  def change
    add_column :zones, :file_size, :integer
  end
end
