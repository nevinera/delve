# frozen_string_literal: true

class DeviseCreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.string :email, null: false, default: ""

      ## Rememberable
      t.datetime :remember_created_at

      ## Trackable
      t.integer  :sign_in_count, default: 0, null: false
      t.datetime :current_sign_in_at
      t.datetime :last_sign_in_at
      t.string   :current_sign_in_ip
      t.string   :last_sign_in_ip

      ## OmniAuth
      t.string :provider, null: false
      t.string :uid,      null: false
      t.string :name

      t.timestamps null: false
    end

    add_index :users, :email, unique: true
    add_index :users, [:provider, :uid], unique: true
  end
end
