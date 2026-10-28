class CreateWorlds < ActiveRecord::Migration[8.1]
  def change
    create_table :worlds do |t|
      t.references :user, null: false, foreign_key: true
      t.string :repo, null: false
      t.string :name
      t.string :default_branch, null: false
      t.string :released_sha
      t.datetime :opened_at, null: false

      t.timestamps
    end

    add_index :worlds, :repo, unique: true
  end
end
