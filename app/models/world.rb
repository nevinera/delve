class World < ApplicationRecord
  belongs_to :owner, class_name: "User"
  has_many :world_versions, dependent: :destroy

  validates :repo, presence: true,
    format: {with: /\A[\w.-]+\/[\w.-]+\z/, message: "must be username/reponame"}
  validates :path, presence: true,
    format: {with: /\Aworlds\/.+\.json\z/, message: "must be a worlds/*.json path"},
    uniqueness: {scope: :repo}

  def key = path.delete_prefix("worlds/").delete_suffix(".json")

  def released_versions = world_versions.available.order(released_at: :desc)
end
