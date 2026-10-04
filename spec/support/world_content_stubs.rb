require "digest"

# Builds a published world as ImportWorldVersionJob would leave it (names,
# entry point, and zone links stored), with its zone files served (via
# webmock) from the pinned raw URL with matching checksums, so
# WorldContent.zone reads succeed.
module WorldContentStubs
  # A two-zone world: darkwood's "road/north" (exposed as "north-exit") is
  # linked both ways to cave's entry point "mouth/in", and the world is
  # entered at darkwood's "camp/spawn".
  def demo_world_files = {world: demo_world_file, zones: demo_zone_files}

  def demo_world_file
    {
      "name" => "Demo World",
      "description" => "A world for specs.",
      "zones" => {
        "darkwood" => {"path" => "../zones/darkwood/darkwood.json", "name" => "Darkwood"},
        "cave" => {"path" => "../zones/cave/cave.json", "name" => "Cave"}
      },
      "worldLinks" => [{
        "zoneA" => {"zone" => "darkwood", "kind" => "open", "connection" => "north-exit"},
        "zoneB" => {"zone" => "cave", "kind" => "entryPoint", "connection" => "mouth/in"},
        "oneWay" => false, "requiredKey" => nil
      }],
      "entryPoints" => {"darkwood/camp/spawn" => nil}
    }
  end

  def demo_zone_files = {"darkwood" => darkwood_zone_file, "cave" => cave_zone_file}

  def darkwood_zone_file
    {
      "name" => "Darkwood",
      "maps" => [
        {"identifier" => "camp", "connections" => [{"identifier" => "spawn"}]},
        {"identifier" => "road", "connections" => [{"identifier" => "north"}]}
      ],
      "entryPoints" => {"camp/spawn" => nil},
      "openConnections" => {"road/north" => "north-exit"}
    }
  end

  def cave_zone_file
    {
      "name" => "Cave",
      "maps" => [{"identifier" => "mouth", "connections" => [{"identifier" => "in"}]}],
      "entryPoints" => {"mouth/in" => nil}
    }
  end

  # Creates the World, a WorldVersion (attrs override its defaults) and its
  # Zones, and stubs every file. Returns the version.
  def published_world(files: demo_world_files, world: nil, **version_attrs)
    name = files[:world]["name"]
    world = named_world(world, name)
    sha = SecureRandom.hex(20)
    base_url = "https://raw.githubusercontent.com/#{world.repo}/#{sha}/"
    version = create(:world_version, :released, world:, name:, commit_sha: sha, raw_base_url: base_url, **version_attrs)
    entry = WorldContent::Links.default_entry(files[:world])
    files[:zones].each { |key, data| publish_zone(version, files, key, data, entry) }
    version
  end

  def named_world(world, name)
    (world || create(:world, path: "worlds/demo.json")).tap { |w| w.update!(name:) if w.name.blank? }
  end

  def publish_zone(version, files, key, data, entry)
    entry_zone, entry_connection = entry
    body = data.to_json
    path = "zones/#{key}/#{key}.full.json"
    create(:zone, world_version: version, identifier: key, path:, content_sha: Digest::SHA1.hexdigest(body),
      links: WorldContent::Links.links_for(files[:world], key, files[:zones]),
      entry_connection_key: (entry_connection if key == entry_zone))
    stub_request(:get, "#{version.raw_base_url}#{path}").to_return(body:)
  end
end

RSpec.configure { |config| config.include WorldContentStubs }
