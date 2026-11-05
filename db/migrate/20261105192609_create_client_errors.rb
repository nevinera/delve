class CreateClientErrors < ActiveRecord::Migration[8.1]
  def change
    create_table :client_errors do |t|
      t.string :fingerprint, null: false, index: {unique: true}
      t.text :message, null: false
      t.string :page
      t.text :stack
      t.integer :count, null: false, default: 1
      t.datetime :first_seen_at, null: false
      t.datetime :last_seen_at, null: false, index: true
      t.references :user, foreign_key: {on_delete: :nullify}
      t.string :build
      t.json :details
      t.timestamps
    end
  end
end
