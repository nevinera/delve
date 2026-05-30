class CreateHandles < ActiveRecord::Migration[8.1]
  def change
    create_table :handles do |t|
      t.references :user, null: false, foreign_key: true
      t.string :identifier, null: false
      t.text :description

      t.timestamps
    end

    add_index :handles, :identifier, unique: true
  end
end
