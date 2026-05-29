class CreateCharacterClasses < ActiveRecord::Migration[8.1]
  def change
    create_table :character_classes do |t|
      t.references :user, null: false, foreign_key: true
      t.string :identifier, null: false
      t.string :location, null: false
      t.text :definition, null: false

      t.timestamps
    end

    add_index :character_classes, :identifier, unique: true
  end
end
