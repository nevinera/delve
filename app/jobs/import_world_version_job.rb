require "digest"

# Imports a WorldVersion from its repo: resolves the ref to a commit SHA,
# fetches and validates the world file and every zone's .full.json at that
# SHA, cross-checks the world's links and entry points against the zones,
# then replaces the version's Zone rows. Only references and checksums are
# stored - never the content itself (see plans/worlds.md). On any failure
# the version is marked failed and its existing zones are left alone.
class ImportWorldVersionJob < ApplicationJob
  queue_as :default

  ImportError = Class.new(StandardError)

  RAW_BASE = "https://raw.githubusercontent.com"

  def perform(world_version_id)
    @version = WorldVersion.find(world_version_id)
    @version.update!(state: :importing, validity_error: nil)
    import!
  rescue ImportError, Validators::ValidationError, Github::NotFoundError, Github::ApiError,
    Github::ReauthRequiredError, Github::NoRepositoryError => e
    @version.update!(state: :failed, validity_error: e.message)
  rescue => e
    @version&.update!(state: :failed, validity_error: "unexpected import error: #{e.message}")
    raise
  end

  private

  def world = @version.world

  def import!
    sha = resolve_commit_sha
    base_url = "#{RAW_BASE}/#{world.repo}/#{sha}/"
    world_body = fetch!(base_url, world.path)
    world_data = parse!(world_body, world.path)
    in_file(world.path) { Validators::WorldValidator.validate!(world_data) }
    zones = world_data["zones"].to_h { |key, entry| [key, fetch_zone!(base_url, key, entry)] }
    zones_by_key = zones.transform_values { |z| z[:data] }
    in_file(world.path) { Validators::WorldReferences.validate!(world_data, zones_by_key) }
    entry = WorldContent::Links.default_entry(world_data)
    raise ImportError, "#{world.path}: every entry point needs a key, so nobody could enter" unless entry
    zones.each { |key, zone| zone[:links] = WorldContent::Links.links_for(world_data, key, zones_by_key) }
    save!(sha:, base_url:, world_data:, zones:, entry:)
  end

  def resolve_commit_sha
    client = Github::ContentClient.new(world.owner)
    unless client.repo == world.repo
      raise ImportError, "the owner's GitHub connection points at #{client.repo}, not #{world.repo}"
    end
    client.tag_sha(@version.ref)
  end

  def fetch_zone!(base_url, key, entry)
    path = full_zone_path(entry["path"])
    body = fetch!(base_url, path)
    data = parse!(body, path)
    in_file(path) { Validators::ZoneValidator.validate!(data) }
    {path:, data:, content_sha: Digest::SHA1.hexdigest(body)}
  end

  # A world's zone paths are relative to the world file, and point at the
  # zone's abstract file; the importable one is its .full.json sibling.
  def full_zone_path(relative_path)
    path = Pathname(world.path).dirname.join(relative_path).cleanpath.to_s
    raise ImportError, "#{world.path}: zone path #{relative_path} is outside the repo" if path.start_with?("..", "/")
    path.sub(/\.json\z/, ".full.json")
  end

  def fetch!(base_url, path)
    response = Net::HTTP.get_response(URI("#{base_url}#{path}"))
    raise ImportError, "#{path}: HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)
    response.body
  end

  def parse!(body, path)
    JSON.parse(body)
  rescue JSON::ParserError => e
    raise ImportError, "#{path}: invalid JSON: #{e.message}"
  end

  def in_file(path)
    yield
  rescue Validators::ValidationError => e
    raise ImportError, "#{path}: #{e.message}"
  end

  # Stores references, checksums, and the structure Rails needs without
  # re-reading the files: the display name, which zone connection is the
  # default entry point, and where each zone's exits lead.
  def save!(sha:, base_url:, world_data:, zones:, entry:)
    entry_zone, entry_connection = entry
    WorldVersion.transaction do
      Zone.where(world_version: @version).delete_all
      zones.each do |key, zone|
        @version.zones.create!(
          identifier: key, path: zone[:path], content_sha: zone[:content_sha],
          links: zone[:links], entry_connection_key: (entry_connection if key == entry_zone)
        )
      end
      @version.update!(
        commit_sha: sha, raw_base_url: base_url, name: world_data["name"], state: :unreleased, imported_at: Time.current
      )
      world.update!(name: world_data["name"]) if world.name.blank?
    end
  end
end
