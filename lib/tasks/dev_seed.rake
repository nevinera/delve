namespace :dev do
  desc "Seed a user/class/characters pointing at a local content server (localhost:8001)"
  task seed_local: :environment do
    user = seed_user
    character_class = seed_character_class(user)
    seed_character(user, character_class, name: "Trainee-Adam",
      token_url: ":elf-male-1:")
    seed_character(user, character_class, name: "Trainee-Bob",
      token_url: ":elf-female-1:")

    # Zones aren't seeded: play them from the same server through Build >
    # Play a local zone (see Build::ZonePlaysController).
    puts "Seeded user=#{user.email} class=#{character_class.identifier}"
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
  character_class.location = "http://localhost:8001/classes/puncher.json"
  character_class.save!
  fetch_and_verify!(FetchCharacterClassContentJob, character_class)
  character_class
end

def seed_character(user, character_class, name:, token_url:)
  character = Character.find_or_initialize_by(name: name)
  character.user = user
  character.character_class = character_class
  character.token_url = token_url
  # Trainee gear comes per world, when the character first enters one.
  character.save!
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
