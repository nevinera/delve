# Classes no longer have a .full.json companion - the class editor writes
# every power inline into classes/<key>.json itself and deletes the old
# .full.json - so records point at the class's own file instead.
class PointCharacterClassesAtOwnFiles < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      UPDATE character_classes
      SET location = substr(location, 1, length(location) - length('.full.json')) || '.json'
      WHERE location LIKE '%.full.json'
    SQL
  end

  def down
    execute <<~SQL
      UPDATE character_classes
      SET location = substr(location, 1, length(location) - length('.json')) || '.full.json'
      WHERE location LIKE '%.json' AND location NOT LIKE '%.full.json'
    SQL
  end
end
