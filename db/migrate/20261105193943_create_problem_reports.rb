class CreateProblemReports < ActiveRecord::Migration[8.1]
  def change
    create_table :problem_reports do |t|
      t.references :user, foreign_key: {on_delete: :nullify}
      t.string :kind, null: false
      t.text :note
      t.string :page
      t.string :build
      t.json :details
      t.string :voice_type
      t.boolean :screenshot, null: false, default: false
      t.datetime :done_at, index: true
      t.timestamps
    end
  end
end
