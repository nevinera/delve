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

ActiveRecord::Schema[8.1].define(version: 2026_08_06_143311) do
  create_table "character_classes", force: :cascade do |t|
    t.string "content_sha"
    t.datetime "created_at", null: false
    t.integer "file_size"
    t.integer "handle_id", null: false
    t.string "identifier", null: false
    t.string "location", null: false
    t.string "state", default: "provided", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.string "validity_error"
    t.string "version", null: false
    t.index ["handle_id", "identifier", "version"], name: "idx_on_handle_id_identifier_version_b6e2d417bf", unique: true
    t.index ["handle_id"], name: "index_character_classes_on_handle_id"
    t.index ["state"], name: "index_character_classes_on_state"
    t.index ["user_id"], name: "index_character_classes_on_user_id"
  end

  create_table "character_items", force: :cascade do |t|
    t.integer "agility"
    t.integer "character_id", null: false
    t.datetime "created_at", null: false
    t.integer "crit_rating"
    t.text "description"
    t.integer "haste_rating"
    t.string "identifier", null: false
    t.integer "ilvl", null: false
    t.integer "intellect"
    t.integer "mastery_rating"
    t.string "name", null: false
    t.integer "provenance_zone_id", null: false
    t.datetime "received_at", null: false
    t.integer "resilience_rating"
    t.string "slot", null: false
    t.json "source_json", default: {}, null: false
    t.string "source_key", null: false
    t.integer "stamina"
    t.integer "strength"
    t.datetime "updated_at", null: false
    t.integer "versatility_rating"
    t.string "version", null: false
    t.decimal "weapon_dps", precision: 6, scale: 2
    t.string "zone_identifier", null: false
    t.index ["character_id", "source_key"], name: "index_character_items_on_character_id_and_source_key", unique: true
    t.index ["character_id"], name: "index_character_items_on_character_id"
    t.index ["provenance_zone_id"], name: "index_character_items_on_provenance_zone_id"
  end

  create_table "characters", force: :cascade do |t|
    t.integer "character_class_id", null: false
    t.datetime "created_at", null: false
    t.datetime "last_played_at"
    t.string "name", null: false
    t.integer "time_logged", default: 0, null: false
    t.string "token_url", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["character_class_id"], name: "index_characters_on_character_class_id"
    t.index ["name"], name: "index_characters_on_name", unique: true
    t.index ["user_id"], name: "index_characters_on_user_id"
  end

  create_table "equipped_items", force: :cascade do |t|
    t.integer "character_id", null: false
    t.integer "character_item_id", null: false
    t.datetime "created_at", null: false
    t.string "equipped_slot", null: false
    t.datetime "updated_at", null: false
    t.index ["character_id", "equipped_slot"], name: "index_equipped_items_on_character_id_and_equipped_slot", unique: true
    t.index ["character_id"], name: "index_equipped_items_on_character_id"
    t.index ["character_item_id"], name: "index_equipped_items_on_character_item_id", unique: true
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

  create_table "slot_sessions", force: :cascade do |t|
    t.integer "character_id", null: false
    t.datetime "created_at", null: false
    t.string "instance_identifier", null: false
    t.datetime "last_confirmed_at"
    t.string "slot_id", null: false
    t.string "token", null: false
    t.datetime "updated_at", null: false
    t.integer "zone_id", null: false
    t.index ["character_id"], name: "index_slot_sessions_on_character_id", unique: true
    t.index ["zone_id"], name: "index_slot_sessions_on_zone_id"
  end

  create_table "users", force: :cascade do |t|
    t.boolean "admin", default: false, null: false
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

  create_table "zones", force: :cascade do |t|
    t.string "config_url", null: false
    t.string "content_sha"
    t.datetime "created_at", null: false
    t.text "description"
    t.integer "file_size"
    t.integer "handle_id", null: false
    t.string "identifier", null: false
    t.string "name", null: false
    t.integer "registering_user_id", null: false
    t.string "state", default: "provided", null: false
    t.datetime "updated_at", null: false
    t.string "validity_error"
    t.string "version", null: false
    t.index ["handle_id"], name: "index_zones_on_handle_id"
    t.index ["identifier", "version"], name: "index_zones_on_identifier_and_version", unique: true
    t.index ["registering_user_id"], name: "index_zones_on_registering_user_id"
    t.index ["state"], name: "index_zones_on_state"
  end

  add_foreign_key "character_classes", "handles"
  add_foreign_key "character_classes", "users"
  add_foreign_key "character_items", "characters"
  add_foreign_key "character_items", "zones", column: "provenance_zone_id"
  add_foreign_key "characters", "character_classes"
  add_foreign_key "characters", "users"
  add_foreign_key "equipped_items", "character_items"
  add_foreign_key "equipped_items", "characters"
  add_foreign_key "handles", "users"
  add_foreign_key "slot_sessions", "characters"
  add_foreign_key "slot_sessions", "zones"
  add_foreign_key "zones", "handles"
  add_foreign_key "zones", "users", column: "registering_user_id"
end
