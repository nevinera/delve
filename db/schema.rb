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

ActiveRecord::Schema[8.1].define(version: 2026_10_07_140000) do
  create_table "character_classes", force: :cascade do |t|
    t.string "content_sha"
    t.datetime "created_at", null: false
    t.string "description"
    t.integer "file_size"
    t.string "identifier", null: false
    t.string "location", null: false
    t.string "name"
    t.json "primary_stats", default: [], null: false
    t.json "secondary_stats", default: [], null: false
    t.string "state", default: "provided", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.string "validity_error"
    t.string "version", null: false
    t.json "wields", default: [], null: false
    t.index ["identifier", "version"], name: "index_character_classes_on_identifier_and_version", unique: true
    t.index ["state"], name: "index_character_classes_on_state"
    t.index ["user_id"], name: "index_character_classes_on_user_id"
  end

  create_table "character_flags", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "flag_type", null: false
    t.string "identifier", limit: 64, null: false
    t.integer "world_character_id", null: false
    t.integer "world_version_id"
    t.index ["world_character_id", "flag_type", "identifier"], name: "index_character_flags_uniquely", unique: true
    t.index ["world_version_id"], name: "index_character_flags_on_world_version_id"
  end

  create_table "character_items", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "description"
    t.integer "elvl", null: false
    t.string "identifier", null: false
    t.string "name", null: false
    t.string "primary_stat"
    t.json "secondary_stats", default: [], null: false
    t.string "slot", null: false
    t.json "source_json", default: {}, null: false
    t.datetime "updated_at", null: false
    t.string "version", null: false
    t.integer "world_character_id", null: false
    t.integer "world_version_id"
    t.index ["world_character_id", "identifier", "version"], name: "index_character_items_on_identity", unique: true
    t.index ["world_character_id"], name: "index_character_items_on_world_character_id"
    t.index ["world_version_id"], name: "index_character_items_on_world_version_id"
  end

  create_table "character_quests", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.json "definition", default: {}, null: false
    t.string "quest_identifier", limit: 54, null: false
    t.integer "timer_elapsed_seconds", default: 0, null: false
    t.datetime "updated_at", null: false
    t.integer "world_character_id", null: false
    t.integer "world_version_id"
    t.index ["world_character_id", "quest_identifier"], name: "idx_on_world_character_id_quest_identifier_b7c4d39b8d", unique: true
    t.index ["world_version_id"], name: "index_character_quests_on_world_version_id"
  end

  create_table "character_settings", force: :cascade do |t|
    t.json "ability_button_map", default: {}, null: false
    t.float "camera_sensitivity", default: 1.0, null: false
    t.integer "character_id", null: false
    t.datetime "created_at", null: false
    t.json "custom_hotkeys", default: {}, null: false
    t.datetime "updated_at", null: false
    t.index ["character_id"], name: "index_character_settings_on_character_id", unique: true
  end

  create_table "characters", force: :cascade do |t|
    t.integer "character_class_id", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.string "token_url", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["character_class_id"], name: "index_characters_on_character_class_id"
    t.index ["name"], name: "index_characters_on_name", unique: true
    t.index ["user_id"], name: "index_characters_on_user_id"
  end

  create_table "class_abilities", force: :cascade do |t|
    t.float "cast_time"
    t.integer "character_class_id", null: false
    t.float "cooldown"
    t.float "cost_amount"
    t.string "cost_type"
    t.datetime "created_at", null: false
    t.string "description"
    t.float "global_cooldown"
    t.string "icon_url"
    t.float "max_range"
    t.string "name", null: false
    t.integer "position", null: false
    t.json "source_json", default: {}, null: false
    t.datetime "updated_at", null: false
    t.index ["character_class_id", "position"], name: "index_class_abilities_on_character_class_id_and_position", unique: true
    t.index ["character_class_id"], name: "index_class_abilities_on_character_class_id"
  end

  create_table "equipped_items", force: :cascade do |t|
    t.integer "character_item_id", null: false
    t.datetime "created_at", null: false
    t.string "equipped_slot", null: false
    t.datetime "updated_at", null: false
    t.integer "world_character_id", null: false
    t.index ["character_item_id"], name: "index_equipped_items_on_character_item_id", unique: true
    t.index ["world_character_id", "equipped_slot"], name: "index_equipped_items_on_world_character_id_and_equipped_slot", unique: true
    t.index ["world_character_id"], name: "index_equipped_items_on_world_character_id"
  end

  create_table "github_installations", force: :cascade do |t|
    t.text "access_token", null: false
    t.datetime "access_token_expires_at", null: false
    t.datetime "created_at", null: false
    t.bigint "installation_id", null: false
    t.text "refresh_token", null: false
    t.datetime "refresh_token_expires_at", null: false
    t.string "repo_full_name", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["installation_id"], name: "index_github_installations_on_installation_id", unique: true
    t.index ["user_id"], name: "index_github_installations_on_user_id", unique: true
  end

  create_table "quest_progresses", force: :cascade do |t|
    t.integer "character_quest_id", null: false
    t.integer "count", default: 0, null: false
    t.datetime "created_at", null: false
    t.json "objective", default: {}, null: false
    t.string "objective_hash", null: false
    t.integer "position", null: false
    t.datetime "updated_at", null: false
    t.index ["character_quest_id", "objective_hash"], name: "idx_on_character_quest_id_objective_hash_b0890fad2a", unique: true
  end

  create_table "slot_sessions", force: :cascade do |t|
    t.integer "character_id", null: false
    t.datetime "created_at", null: false
    t.string "instance_identifier", null: false
    t.datetime "last_confirmed_at"
    t.string "slot_id", null: false
    t.string "token", null: false
    t.datetime "updated_at", null: false
    t.integer "zone_id"
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

  create_table "world_characters", force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.integer "character_id", null: false
    t.string "connection_key"
    t.datetime "created_at", null: false
    t.datetime "last_played_at"
    t.datetime "updated_at", null: false
    t.integer "world_id", null: false
    t.integer "world_version_id"
    t.string "zone_identifier"
    t.index ["character_id"], name: "index_world_characters_on_character_id"
    t.index ["world_id", "character_id"], name: "index_world_characters_on_world_id_and_character_id", unique: true
    t.index ["world_id"], name: "index_world_characters_on_world_id"
    t.index ["world_version_id"], name: "index_world_characters_on_world_version_id"
  end

  create_table "world_versions", force: :cascade do |t|
    t.string "commit_sha"
    t.datetime "created_at", null: false
    t.datetime "expires_at"
    t.datetime "imported_at"
    t.string "name"
    t.json "provenance_restrictions"
    t.string "quests_path"
    t.string "quests_sha"
    t.string "raw_base_url"
    t.string "ref", null: false
    t.datetime "released_at"
    t.string "state", default: "importing", null: false
    t.datetime "updated_at", null: false
    t.text "validity_error"
    t.integer "world_id", null: false
    t.index ["world_id", "ref"], name: "index_world_versions_on_world_id_and_ref", unique: true
    t.index ["world_id", "state"], name: "index_world_versions_on_world_id_and_state"
    t.index ["world_id"], name: "index_world_versions_on_world_id"
  end

  create_table "worlds", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name"
    t.integer "owner_id", null: false
    t.string "path", null: false
    t.string "repo", null: false
    t.datetime "updated_at", null: false
    t.index ["owner_id"], name: "index_worlds_on_owner_id"
    t.index ["repo", "path"], name: "index_worlds_on_repo_and_path", unique: true
  end

  create_table "zones", force: :cascade do |t|
    t.string "content_sha"
    t.datetime "created_at", null: false
    t.string "entry_connection_key"
    t.string "identifier", null: false
    t.json "links", default: {}, null: false
    t.string "path", null: false
    t.datetime "updated_at", null: false
    t.integer "world_version_id", null: false
    t.index ["world_version_id", "identifier"], name: "index_zones_on_world_version_id_and_identifier", unique: true
    t.index ["world_version_id"], name: "index_zones_on_world_version_id"
  end

  add_foreign_key "character_classes", "users"
  add_foreign_key "character_flags", "world_characters"
  add_foreign_key "character_flags", "world_versions", on_delete: :nullify
  add_foreign_key "character_items", "world_characters"
  add_foreign_key "character_items", "world_versions", on_delete: :nullify
  add_foreign_key "character_quests", "world_characters"
  add_foreign_key "character_quests", "world_versions", on_delete: :nullify
  add_foreign_key "character_settings", "characters"
  add_foreign_key "characters", "character_classes"
  add_foreign_key "characters", "users"
  add_foreign_key "class_abilities", "character_classes"
  add_foreign_key "equipped_items", "character_items"
  add_foreign_key "equipped_items", "world_characters"
  add_foreign_key "github_installations", "users"
  add_foreign_key "quest_progresses", "character_quests", on_delete: :cascade
  add_foreign_key "slot_sessions", "characters"
  add_foreign_key "slot_sessions", "zones"
  add_foreign_key "world_characters", "characters"
  add_foreign_key "world_characters", "world_versions"
  add_foreign_key "world_characters", "worlds"
  add_foreign_key "world_versions", "worlds"
  add_foreign_key "worlds", "users", column: "owner_id"
  add_foreign_key "zones", "world_versions"
end
