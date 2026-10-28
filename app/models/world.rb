# A world kept in a GitHub repo, recorded the first time someone opens it in the editor. Players
# play the commit at released_sha. Its user is whoever opened it first.
class World < ApplicationRecord
  belongs_to :user
  has_many :imports, class_name: "WorldImport", dependent: :destroy

  validates :repo, presence: true, uniqueness: true, format: {with: %r{\A[\w.-]+/[\w.-]+\z}}
  validates :default_branch, :opened_at, presence: true

  # What the editor's ?from= takes to open it.
  def source = "github/#{repo}"

  def display_name = name.presence || repo.split("/").last
end
