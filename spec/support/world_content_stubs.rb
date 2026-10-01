require "digest"

# Builds a published world as ImportWorldVersionJob would leave it (names,
# entry point, and zone links stored), with its zone files served (via
# webmock) from the pinned raw URL with matching checksums, so
# WorldContent.zone reads succeed.
module WorldContentStubs
  # A two-zone world: darkwood's "road/north" (exposed as "north-exit") is
  # linked both ways to cave's entry point "mouth/in", and the world is
  # entered at darkwood's "camp/spawn".
  def demo_world_files
    {
      world: {
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
      },
      zones: {
        "darkwood" => {
          "name" => "Darkwood",
          "maps" => [
            {"identifier" => "camp", "connections" => [{"identifier" => "spawn"}]},
            {"identifier" => "road", "connections" => [{"identifier" => "north"}]}
          ],
          "entryPoints" => {"camp/spawn" => nil},
          "openConnections" => {"road/north" => "north-exit"}
        },
        "cave" => {
          "name" => "Cave",
          "maps" => [{"identifier" => "mouth", "connections" => [{"identifier" => "in"}]}],
          "entryPoints" => {"mouth/in" => nil}
        }
      }
    }
  end

  # Creates the World, a WorldVersion (attrs override its defaults) and its
  # Zones, and stubs every file. Returns the version.
  def published_world(files: demo_world_files, world: nil, **version_attrs)
    world ||= create(:world, path: "worlds/demo.json")
    sha = SecureRandom.hex(20)
    base_url = "https://raw.githubusercontent.com/#{world.repo}/#{sha}/"
    world_body = files[:world].to_json
    name = files[:world]["name"]
    world.update!(name:) if world.name.blank?
    version = create(:world_version, :released, world:, name:, commit_sha: sha, raw_base_url: base_url,
      content_sha: Digest::SHA1.hexdigest(world_body), **version_attrs)
    entry_zone, entry_connection = WorldContent::Links.default_entry(files[:world])
    files[:zones].each do |key, data|
      body = data.to_json
      path = "zones/#{key}/#{key}.full.json"
      create(:zone, world_version: version, identifier: key, path:, content_sha: Digest::SHA1.hexdigest(body),
        links: WorldContent::Links.links_for(files[:world], key, files[:zones]),
        entry_connection_key: (entry_connection if key == entry_zone))
      stub_request(:get, "#{base_url}#{path}").to_return(body:)
    end
    version
  end
end

RSpec.configure { |config| config.include WorldContentStubs }
