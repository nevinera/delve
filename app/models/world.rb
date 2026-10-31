# A world kept in a GitHub repo, recorded the first time someone opens it in the editor. Players
# play the commit at released_sha, set from an import (WorldImport) when its owner releases it, and
# never looked up from a tag. Its user is whoever opened it first.
class World < ApplicationRecord
  belongs_to :user
  has_many :imports, class_name: "WorldImport", dependent: :destroy
  has_many :world_characters, dependent: :destroy

  validates :repo, presence: true, uniqueness: true, format: {with: %r{\A[\w.-]+/[\w.-]+\z}}
  validates :default_branch, :opened_at, presence: true

  # What /create's ?from= takes to open it.
  def source = "github/#{repo}"

  def display_name = name.presence || repo.split("/").last

  def released? = released_sha.present?

  # Makes an import the version players get the next time they enter.
  def release!(import)
    update!(released_sha: import.sha, released_tag: import.tag, released_at: Time.current)
  end
end
