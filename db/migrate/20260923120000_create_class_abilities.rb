class CreateClassAbilities < ActiveRecord::Migration[8.1]
  def change
    add_column :character_classes, :name, :string
    add_column :character_classes, :description, :string

    create_table :class_abilities do |t|
      t.references :character_class, null: false, foreign_key: true
      t.integer :position, null: false
      t.string :name, null: false
      t.string :description
      t.string :icon_url
      t.float :cast_time
      t.float :global_cooldown
      t.float :cooldown
      t.float :max_range
      t.string :cost_type
      t.float :cost_amount
      t.json :source_json, default: {}, null: false
      t.timestamps
    end
    add_index :class_abilities, [:character_class_id, :position], unique: true
  end
end
