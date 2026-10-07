# A quest a character has accepted and not yet finished (plans/quests.md).
# Rows exist only while a quest is active: completing one grants its
# flags and deletes the row, and failing or abandoning one just deletes it.
# Quest definitions stay in the world's quests file; world_version is the
# version whose definition this row's progress follows.
class CharacterQuest < ApplicationRecord
  MAX_ACTIVE = 20

  Error = Class.new(StandardError)
  AlreadyCompleted = Class.new(Error)
  TooManyActive = Class.new(Error)

  belongs_to :world_character
  belongs_to :world_version, optional: true
  has_many :quest_progresses, dependent: :delete_all

  validates :quest_identifier, format: {with: Validators::QuestValidator::IDENTIFIER_FORMAT}
  # Following some other version's definition (or a deleted version's).
  scope :not_on, ->(version) { where.not(world_version: version).or(where(world_version: nil)) }

  validates :timer_elapsed_seconds, numericality: {only_integer: true, greater_than_or_equal_to: 0}

  # Accepts the quest for world_character under its current version. A
  # no-op when it's already active.
  def self.accept!(world_character, quest_identifier)
    existing = world_character.character_quests.find_by(quest_identifier:)
    return existing if existing
    raise AlreadyCompleted, "#{quest_identifier} is already completed" if CharacterFlag.held?(world_character, completion_flag(quest_identifier))
    raise TooManyActive, "at most #{MAX_ACTIVE} quests can be active at once" if world_character.character_quests.count >= MAX_ACTIVE
    world_character.character_quests.create!(quest_identifier:, world_version_id: world_character.world_version_id)
  end

  def self.completion_flag(quest_identifier) = "quest/completed/#{quest_identifier}"

  def completion_flag = self.class.completion_flag(quest_identifier)

  # {objective_hash => count}.
  def progress = quest_progresses.to_h { |p| [p.objective_hash, p.count] }

  # Sets each objective's count (absolute, so a retried call is harmless).
  def record_progress!(counts)
    transaction do
      counts.each do |objective_hash, count|
        quest_progresses.find_or_initialize_by(objective_hash:).update!(count:)
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
end
