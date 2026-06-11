class CreateCharacters < ActiveRecord::Migration[8.1]
  def change
    create_table :characters do |t|
      t.references :user, null: false, foreign_key: true
      t.references :character_class, null: false, foreign_key: true
      t.string :name, null: false
      t.integer :time_logged, null: false, default: 0
      t.datetime :last_played_at

      t.timestamps
    end

    add_index :characters, :name, unique: true
  end
end
