namespace :dev do
  desc "Seed a user/class/zones/characters pointing at a local content server (localhost:8001)"
  task seed_local: :environment do
    user = seed_user
    character_class = seed_character_class(user)
    small_cave = seed_zone(user, identifier: "small_cave", version: "0.1", name: "Small Cave",
      description: "Just one goblin", config_url: "http://localhost:8001/zones/small-cave/small-cave.full.json")
    goblin_cave = seed_zone(user, identifier: "goblin_cave", version: "0.1", name: "Goblin Cave",
      description: "A damp cave carved out by generations of goblin raiders.", config_url: "http://localhost:8001/zones/goblin-cave/goblin-cave.full.json")
    seed_character(user, character_class, name: "Trainee-Adam",
      token_url: "http://localhost:8001/tokens/character/male-elf-guard.webp")
    seed_character(user, character_class, name: "Trainee-Bob",
      token_url: "http://localhost:8001/tokens/character/female-elf-tribal.webp")

    puts "Seeded user=#{user.email} class=#{character_class.identifier} " \
      "zones=[#{small_cave.identifier}, #{goblin_cave.identifier}]"
  end
end

# Prefer whatever real (non-seed) user already exists - typically the
# developer's own Google account, once they've logged in at least once -
# so seeded characters/zones/etc. end up owned by the account you're
# actually signed in as, rather than an unreachable placeholder you can
# never log into. Falls back to a placeholder local_dev user only when no
# real user has ever signed in yet (e.g. a completely fresh database).
def seed_user
  User.where.not(provider: "local_dev").order(:created_at).first ||
    User.find_or_create_by!(provider: "local_dev", uid: "local_dev") do |u|
      u.email = "dev@localhost"
      u.name = "Local Dev"
    end
end

def seed_character_class(user)
  character_class = CharacterClass.find_or_initialize_by(user: user, identifier: "puncher_local", version: "0.1")
  character_class.location = "http://localhost:8001/classes/puncher.full.json"
  character_class.save!
  fetch_and_verify!(FetchCharacterClassContentJob, character_class)
  character_class
end

def seed_zone(user, attrs)
  zone = Zone.find_or_initialize_by(identifier: attrs.fetch(:identifier), version: attrs.fetch(:version))
  zone.registering_user = user
  zone.name = attrs.fetch(:name)
  zone.description = attrs.fetch(:description)
  zone.config_url = attrs.fetch(:config_url)
  zone.save!
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
