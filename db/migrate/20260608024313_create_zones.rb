class CreateZones < ActiveRecord::Migration[8.1]
  def change
    create_table :zones do |t|
      t.references :handle, null: false, foreign_key: true
      t.references :registering_user, null: false, foreign_key: {to_table: :users}
      t.string :config_url, null: false
      t.string :version, null: false
      t.string :identifier, null: false
      t.string :name, null: false
      t.text :description

      t.timestamps
    end

    add_index :zones, [:identifier, :version], unique: true
  end
end
