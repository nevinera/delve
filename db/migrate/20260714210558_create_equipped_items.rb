class CreateEquippedItems < ActiveRecord::Migration[8.1]
  def change
    create_table :equipped_items do |t|
      t.references :character, null: false, foreign_key: true
      t.references :character_item, null: false, foreign_key: true, index: {unique: true}
      t.string :equipped_slot, null: false

      t.timestamps
    end

    add_index :equipped_items, [:character_id, :equipped_slot], unique: true
  end
end
