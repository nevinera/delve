class CreateGithubConnections < ActiveRecord::Migration[8.1]
  def change
    create_table :github_connections do |t|
      t.references :user, null: false, foreign_key: true, index: {unique: true}
      t.string :login, null: false
      t.text :access_token, null: false
      t.text :refresh_token, null: false
      t.datetime :access_token_expires_at, null: false
      t.datetime :refresh_token_expires_at, null: false

      t.timestamps
    end
  end
end
