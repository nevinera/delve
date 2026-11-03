# Empties a world's repo, as one commit on its default branch: every world file
# (.agents/formats.md) goes, and a new world.json starts a world with one continent, as
# /create's new world does. Other files, like a README or LICENSE, stay. Tags and the released
# commit stay where they were.
class WorldReset
  WORLD_FILES = %r{
    \A(?:world|collections|template-collections|structure-collections|shapes)\.json\z |
    \A(?:objects|templates|textures|images|structures|places|
         classes|abilities|statuses|items|item-templates|creatures|npcs|dialogues)/
  }x

  class NothingToReset < StandardError; end

  def initialize(api, world)
    @api = api
    @world = world
  end

  # The new commit's sha.
  def call
    repo = @api.repo(@world.repo) or raise NothingToReset, "GitHub has no #{@world.repo}, or the app can't see it."
    branch = repo["default_branch"]
    head = @api.branch_sha(@world.repo, branch) or raise NothingToReset, "#{@world.repo} has no commits yet."
    @api.commit(@world.repo, branch, kept(head) + [world_json], message: "Start over with an empty world", parent_sha: head)
  end

  private

  # The repo's files that aren't the world's, as tree entries.
  def kept(head)
    @api.tree(@world.repo, head)
      .select { |entry| entry["type"] != "tree" && !WORLD_FILES.match?(entry["path"]) }
      .map { |entry| entry.slice("path", "mode", "type", "sha") }
  end

  def world_json
    info = {version: 2, name: @world.display_name, continents: [{key: "main", name: "Main"}], dungeons: []}
    {path: "world.json", mode: "100644", type: "blob", content: "#{JSON.pretty_generate(info)}\n"}
  end
end
