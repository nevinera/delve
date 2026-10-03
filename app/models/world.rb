class World < ApplicationRecord
  belongs_to :owner, class_name: "User"
  has_many :world_versions, dependent: :destroy
  has_many :world_characters, dependent: :destroy

  validates :repo, presence: true,
    format: {with: /\A[\w.-]+\/[\w.-]+\z/, message: "must be username/reponame"}
  validates :path, presence: true,
    format: {with: /\Aworlds\/.+\.json\z/, message: "must be a worlds/*.json path"},
    uniqueness: {scope: :repo}

  # A self-contained world (see plans/world-editor/) lives at
  # worlds/<key>/<key>.json, with everything it uses under worlds/<key>/;
  # an older one is a lone worlds/<key>.json.
  SELF_CONTAINED_PATH = %r{\Aworlds/([\w-]+)/\1\.json\z}

  def self.self_contained_path(key) = "worlds/#{key}/#{key}.json"

  def self.key_for(path)
    path.match(SELF_CONTAINED_PATH)&.[](1) || path.delete_prefix("worlds/").delete_suffix(".json")
  end

  def self.self_contained_path?(path) = path.match?(SELF_CONTAINED_PATH)

  # The world files among paths under worlds/: every self-contained world's
  # own file, and every older-style world file - but nothing else inside a
  # self-contained world's directory (its zones, unit types, ...), and no
  # .layout.json/.full.json companions.
  def self.world_file_paths(paths)
    json = paths.select { |path| path.end_with?(".json") && !path.end_with?(".layout.json", ".full.json") }
    own_dirs = json.select { |path| self_contained_path?(path) }.map { |path| "#{File.dirname(path)}/" }
    json.select { |path| self_contained_path?(path) || own_dirs.none? { |dir| path.start_with?(dir) } }.sort
  end

  def key = self.class.key_for(path)

  def self_contained? = self.class.self_contained_path?(path)

  def released_versions = world_versions.available.order(released_at: :desc)
end
