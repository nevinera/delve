class CharacterWorld < ApplicationRecord
  belongs_to :character
  belongs_to :world
  has_many :character_tags, dependent: :destroy

  validates :entered_at, presence: true
  validates :world_id, uniqueness: {scope: :character_id}

  # Tags usable in a given world version: granted at or below it.
  def tags_available_in(world_version)
    current = world_version.content_version
    character_tags.select { |tag| ContentVersion.parse(tag.granted_version) <= current }
  end
end
