class AddInvalidStateAndValidityErrorToZones < ActiveRecord::Migration[8.1]
  def change
    add_column :zones, :validity_error, :string
  end
end
