# A builder playing a zone straight from their repo has no Zone record.
class AllowSlotSessionsWithoutZone < ActiveRecord::Migration[8.1]
  def change
    change_column_null :slot_sessions, :zone_id, true
  end
end
