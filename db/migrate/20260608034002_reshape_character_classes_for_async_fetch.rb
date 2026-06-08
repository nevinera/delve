class ReshapeCharacterClassesForAsyncFetch < ActiveRecord::Migration[8.1]
  def change
    remove_column :character_classes, :definition, :text
    add_column :character_classes, :state, :string, null: false, default: "provided"
    add_column :character_classes, :content_sha, :string
    add_column :character_classes, :file_size, :integer
    add_column :character_classes, :validity_error, :string
    add_index :character_classes, :state
  end
end
