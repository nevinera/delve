# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_29_010000) do
  create_table "characters", force: :cascade do |t|
    t.integer "user_id", null: false
    t.string "name", null: false
    t.json "look", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_characters_on_name", unique: true
    t.index ["user_id"], name: "index_characters_on_user_id"
  end

  create_table "github_connections", force: :cascade do |t|
    t.integer "user_id", null: false
    t.string "login", null: false
    t.text "access_token", null: false
    t.text "refresh_token", null: false
    t.datetime "access_token_expires_at", null: false
    t.datetime "refresh_token_expires_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id"], name: "index_github_connections_on_user_id", unique: true
  end

  create_table "users", force: :cascade do |t|
    t.string "email", default: "", null: false
    t.datetime "remember_created_at"
    t.integer "sign_in_count", default: 0, null: false
    t.datetime "current_sign_in_at"
    t.datetime "last_sign_in_at"
    t.string "current_sign_in_ip"
    t.string "last_sign_in_ip"
    t.string "provider", null: false
    t.string "uid", null: false
    t.string "name"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["provider", "uid"], name: "index_users_on_provider_and_uid", unique: true
  end

  create_table "world_imports", force: :cascade do |t|
    t.integer "world_id", null: false
    t.string "tag", null: false
    t.string "sha"
    t.string "status", default: "queued", null: false
    t.boolean "private_repo"
    t.json "problems"
    t.json "files"
    t.integer "file_count"
    t.bigint "bytes"
    t.text "error"
    t.datetime "started_at"
    t.datetime "finished_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["world_id", "sha"], name: "index_world_imports_on_world_id_and_sha"
    t.index ["world_id", "tag"], name: "index_world_imports_on_world_id_and_tag"
    t.index ["world_id"], name: "index_world_imports_on_world_id"
  end

  create_table "worlds", force: :cascade do |t|
    t.integer "user_id", null: false
    t.string "repo", null: false
    t.string "name"
    t.string "default_branch", null: false
    t.string "released_sha"
    t.datetime "opened_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "released_tag"
    t.datetime "released_at"
    t.index ["repo"], name: "index_worlds_on_repo", unique: true
    t.index ["user_id"], name: "index_worlds_on_user_id"
  end

  add_foreign_key "characters", "users"
  add_foreign_key "github_connections", "users"
  add_foreign_key "world_imports", "worlds"
  add_foreign_key "worlds", "users"
end
