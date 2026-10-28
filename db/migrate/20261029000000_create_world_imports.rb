class CreateWorldImports < ActiveRecord::Migration[8.1]
  def change
    create_table :world_imports do |t|
      t.references :world, null: false, foreign_key: true
      t.string :tag, null: false
      t.string :sha
      t.string :status, null: false, default: "queued"
      t.boolean :private_repo
      t.json :problems
      t.json :files
      t.integer :file_count
      t.bigint :bytes
      t.text :error
      t.datetime :started_at
      t.datetime :finished_at

      t.timestamps
    end

    add_index :world_imports, [:world_id, :tag]
    add_index :world_imports, [:world_id, :sha]
  end
end
