class AddElvlToZones < ActiveRecord::Migration[8.1]
  def change
    add_column :zones, :elvl, :integer
  end
end
