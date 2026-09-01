class CreateGithubInstallations < ActiveRecord::Migration[8.1]
  def change
    create_table :github_installations do |t|
      t.references :user, null: false, foreign_key: true, index: {unique: true}
      t.bigint :installation_id, null: false
      t.string :repo_full_name, null: false
      t.text :access_token, null: false
      t.text :refresh_token, null: false
      t.datetime :access_token_expires_at, null: false
      t.datetime :refresh_token_expires_at, null: false

      t.timestamps
    end

    add_index :github_installations, :installation_id, unique: true
  end
end
