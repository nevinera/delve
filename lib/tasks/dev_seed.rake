namespace :dev do
  desc "Seed a user/handle/class/zones/characters pointing at a local content server (localhost:8001)"
  task seed_local: :environment do
    user = seed_user
    handle = seed_handle(user)
    character_class = seed_character_class(user, handle)
    small_cave = seed_zone(user, handle,
      identifier: "small_cave", version: "0.1", name: "Small Cave", description: "Just one goblin",
      config_url: "http://localhost:8001/zones/small-cave.full.json")
    goblin_cave = seed_zone(user, handle,
      identifier: "goblin_cave", version: "0.1", name: "Goblin Cave",
      description: "A damp cave carved out by generations of goblin raiders.",
      config_url: "http://localhost:8001/zones/goblin-cave.full.json")
    seed_character(user, character_class, name: "Trainee-Adam",
      token_url: "http://localhost:8001/character-tokens/male-elf-guard.webp")
    seed_character(user, character_class, name: "Trainee-Bob",
      token_url: "http://localhost:8001/character-tokens/female-elf-tribal.webp")

    puts "Seeded user=#{user.email} handle=#{handle.identifier} class=#{character_class.full_identifier} " \
      "zones=[#{small_cave.identifier}, #{goblin_cave.identifier}]"
  end
end

def seed_user
  User.find_or_create_by!(provider: "local_dev", uid: "local_dev") do |u|
    u.email = "dev@localhost"
    u.name = "Local Dev"
  end
end

def seed_handle(user)
  Handle.find_or_create_by!(user: user, identifier: "local_dev")
end

def seed_character_class(user, handle)
  character_class = CharacterClass.find_or_create_by!(handle: handle, identifier: "puncher_local", version: "0.1") do |cc|
    cc.user = user
    cc.location = "http://localhost:8001/classes/puncher.full.json"
  end
  fetch_and_verify!(FetchCharacterClassContentJob, character_class)
  character_class
end

def seed_zone(user, handle, identifier:, version:, name:, description:, config_url:)
  zone = Zone.find_or_create_by!(handle: handle, identifier: identifier, version: version) do |z|
    z.registering_user = user
    z.name = name
    z.description = description
    z.config_url = config_url
  end
  fetch_and_verify!(FetchZoneContentJob, zone)
  zone
end

def seed_character(user, character_class, name:, token_url:)
  character = Character.find_or_initialize_by(name: name)
  character.user = user
  character.character_class = character_class
  character.token_url = token_url
  character.save!
  # The after_create hook only enqueues this (development uses the :async
  # adapter), and this task's process exits before that thread pool would
  # get a chance to run it - so grant it inline instead.
  GrantTraineeGearJob.perform_now(character.id)
  character
end

# Runs the fetch job inline (not enqueued) so a stopped content server or a
# validation failure raises immediately, instead of silently leaving the
# record in a provided/validation_failed state.
def fetch_and_verify!(job_class, record)
  job_class.perform_now(record.id)
  record.reload
  return if record.fetched?
  raise "#{record.class.name} #{record.id} (#{record.identifier}) failed to fetch: #{record.validity_error}"
end
