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

ActiveRecord::Schema[8.1].define(version: 2026_05_30_132432) do
  create_table "character_classes", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "definition", null: false
    t.integer "handle_id", null: false
    t.string "identifier", null: false
    t.string "location", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["handle_id", "identifier"], name: "index_character_classes_on_handle_id_and_identifier", unique: true
    t.index ["handle_id"], name: "index_character_classes_on_handle_id"
    t.index ["user_id"], name: "index_character_classes_on_user_id"
  end

  create_table "handles", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "description"
    t.string "identifier", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["identifier"], name: "index_handles_on_identifier", unique: true
    t.index ["user_id"], name: "index_handles_on_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "current_sign_in_at"
    t.string "current_sign_in_ip"
    t.string "email", default: "", null: false
    t.datetime "last_sign_in_at"
    t.string "last_sign_in_ip"
    t.string "name"
    t.string "provider", null: false
    t.datetime "remember_created_at"
    t.integer "sign_in_count", default: 0, null: false
    t.string "uid", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["provider", "uid"], name: "index_users_on_provider_and_uid", unique: true
  end

  add_foreign_key "character_classes", "handles"
  add_foreign_key "character_classes", "users"
  add_foreign_key "handles", "users"
end
