class CreateSlotSessions < ActiveRecord::Migration[8.1]
  def change
    create_table :slot_sessions do |t|
      t.references :character, null: false, foreign_key: true, index: {unique: true}
      t.references :zone, null: false, foreign_key: true
      t.string :token, null: false
      t.string :instance_identifier, null: false
      t.string :slot_id, null: false
      t.datetime :last_confirmed_at

      t.timestamps
    end
  end
end
