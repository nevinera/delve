class CreateCharacterQuests < ActiveRecord::Migration[8.1]
  def change
    create_table :character_quests do |t|
      t.references :world_character, null: false, foreign_key: true, index: false
      t.references :world_version, foreign_key: {on_delete: :nullify}
      t.string :quest_identifier, null: false, limit: 54
      t.integer :timer_elapsed_seconds, null: false, default: 0
      t.timestamps
    end
    add_index :character_quests, [:world_character_id, :quest_identifier], unique: true

    create_table :quest_progresses do |t|
      t.references :character_quest, null: false, foreign_key: {on_delete: :cascade}, index: false
      t.string :objective_hash, null: false
      t.integer :count, null: false, default: 0
      t.timestamps
    end
    add_index :quest_progresses, [:character_quest_id, :objective_hash], unique: true
  end
end
