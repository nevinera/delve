# A use objective's progress is which of its interactables the character
# has used (docs/schema/quest.md#objective), not just how many.
class AddUsedToQuestProgresses < ActiveRecord::Migration[8.1]
  def change
    add_column :quest_progresses, :used, :json, default: [], null: false
  end
end
