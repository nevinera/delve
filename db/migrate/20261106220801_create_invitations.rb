class CreateInvitations < ActiveRecord::Migration[8.1]
  def change
    create_table :invitations do |t|
      t.string :token, null: false
      t.string :note
      t.references :created_by, foreign_key: {to_table: :users}
      t.references :used_by, foreign_key: {to_table: :users}
      t.datetime :used_at
      t.timestamps
    end
    add_index :invitations, :token, unique: true
  end
end
