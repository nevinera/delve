class CharacterTag < ApplicationRecord
  belongs_to :character_world

  validates :name, presence: true, uniqueness: {scope: :character_world_id}
  validates :granted_version, presence: true,
    format: {with: ContentVersion::FORMAT, message: "must be two numeric segments (e.g. 1.5)"}
end
