# A quest a character has accepted and not yet finished (plans/quests.md).
# Rows exist only while a quest is active: completing one grants its
# flags and deletes the row, and failing or abandoning one just deletes it.
#
# The game server supplies the quest's definition on accepting it (and a
# newer one when the world version changes), so Rails never reads the
# quests file outside import. Only the structure is kept: the prose (name,
# texts) stays in the quests file, for the client to read. Each objective
# is a QuestProgress row. world_version is the version the definition is
# from.
class CharacterQuest < ApplicationRecord
  MAX_ACTIVE = 20
  # The quest-level fields kept from a definition; objectives become
  # QuestProgress rows.
  STRUCTURE = %w[chainIdentifier offeredBy turnIn requiresFlags grantsFlags timer rewards].freeze

  Error = Class.new(StandardError)
  AlreadyCompleted = Class.new(Error)
  TooManyActive = Class.new(Error)
  UnknownObjective = Class.new(Error)

  belongs_to :world_character
  belongs_to :world_version, optional: true
  has_many :quest_progresses, -> { order(:position) }, dependent: :delete_all, inverse_of: :character_quest

  validates :quest_identifier, format: {with: Validators::QuestValidator::IDENTIFIER_FORMAT}
  validates :timer_elapsed_seconds, numericality: {only_integer: true, greater_than_or_equal_to: 0}

  # Accepts the quest whose definition is given (a quests-file entry) for
  # world_character, under its current version. A no-op when it's already
  # active.
  def self.accept!(world_character, definition)
    quest_identifier = definition["identifier"].to_s
    existing = world_character.character_quests.find_by(quest_identifier:)
    return existing if existing
    check_acceptable!(world_character, quest_identifier)

    transaction do
      world_character.character_quests.create!(quest_identifier:, world_version_id: world_character.world_version_id)
        .tap { |quest| quest.sync!(definition) }
    end
  end

  def self.check_acceptable!(world_character, quest_identifier)
    raise AlreadyCompleted, "#{quest_identifier} is already completed" if CharacterFlag.held?(world_character, completion_flag(quest_identifier))
    raise TooManyActive, "at most #{MAX_ACTIVE} quests can be active at once" if world_character.character_quests.count >= MAX_ACTIVE
  end
  private_class_method :check_acceptable!

  def self.completion_flag(quest_identifier) = "quest/completed/#{quest_identifier}"

  def completion_flag = self.class.completion_flag(quest_identifier)

  # Replaces the definition with a newer one, under the world character's
  # current version: progress is kept for objectives it still has
  # unchanged (by hash), and the rest start over.
  def sync!(definition)
    transaction do
      update!(definition: definition.slice(*STRUCTURE), world_version_id: world_character.world_version_id)
      sync_objectives!(Array(definition["objectives"]))
    end
    quest_progresses.reset
    self
  end

  # Sets each objective's count by hash (absolute, so a retried call is
  # harmless).
  def record_progress!(counts)
    transaction do
      counts.each do |objective_hash, count|
        progress = quest_progresses.find_by(objective_hash:) or raise UnknownObjective, "#{quest_identifier} has no objective #{objective_hash}"
        progress.update!(count:)
      end
    end
  end

  # Grants the completion flag and flags, and deletes the quest.
  def complete!(grants_flags = [])
    transaction do
      [completion_flag, *grants_flags].each { |flag| CharacterFlag.grant!(world_character, flag) }
      destroy!
    end
  end

  private

  def sync_objectives!(objectives)
    hashes = objectives.each_with_index.map { |objective, position| sync_objective!(objective, position) }
    quest_progresses.where.not(objective_hash: hashes).delete_all
  end

  def sync_objective!(objective, position)
    objective_hash = QuestObjective.hash_of(objective)
    quest_progresses.find_or_initialize_by(objective_hash:).update!(position:, objective: QuestObjective.normalize(objective))
    objective_hash
  end
end
