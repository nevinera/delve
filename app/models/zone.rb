# One zone of an imported WorldVersion: its world zone key (identifier), the
# path of its .full.json relative to the version's raw_base_url, the file's
# checksum, and the structure ImportWorldVersionJob extracts from it (entry
# point, links, and the zone's and its maps' display names).
class Zone < ApplicationRecord
  belongs_to :world_version

  validates :identifier, presence: true, uniqueness: {scope: :world_version_id}
  validates :path, presence: true

  # The zone's exits ("mapId/connectionId" keys of #links).
  def exits = links.keys

  # What item awards and ownership checks treat as this zone's version: its
  # world version's commit SHA. A stopgap until items are tracked per world
  # (worlds slice 4).
  def version_label = world_version.commit_sha
end
