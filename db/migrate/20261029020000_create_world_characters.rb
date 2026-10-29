class CreateWorldCharacters < ActiveRecord::Migration[8.1]
  def change
    create_table :world_characters do |t|
      t.references :world, null: false, foreign_key: true
      t.references :character, null: false, foreign_key: true
      t.string :continent, null: false
      t.float :x, null: false
      t.float :y, null: false
      t.float :z, null: false
      t.float :yaw, null: false, default: 0
      t.timestamps
    end
    add_index :world_characters, [:world_id, :character_id], unique: true
  end
end
