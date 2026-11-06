class CreateMetrics < ActiveRecord::Migration[8.1]
  def change
    create_table :metrics do |t|
      t.string :name, null: false
      t.string :kind, null: false
      t.float :value, null: false
      t.json :tags, null: false, default: {}
      t.integer :user_id
      t.datetime :recorded_at, null: false
    end
    add_index :metrics, [:name, :recorded_at]
    add_index :metrics, :recorded_at
  end
end
