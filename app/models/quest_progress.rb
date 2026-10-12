# One objective of a CharacterQuest: its definition (normalized, see
# QuestObjective), its place in the quest's objectives, and how far the
# character is through it. Identified across world versions by the
# objective's hash. A use objective also records which of its
# interactables are used (count is how many).
class QuestProgress < ApplicationRecord
  belongs_to :character_quest

  validates :objective_hash, presence: true
  validates :position, numericality: {only_integer: true, greater_than_or_equal_to: 0}
  validates :count, numericality: {only_integer: true, greater_than_or_equal_to: 0}

  validate :used_are_the_objectives

  # How many times the objective must be met: for a use objective, once
  # per interactable.
  def required = use? ? interactables.length : objective.fetch("count", 1)

  def use? = objective["type"] == "use"

  def interactables = Array(objective["interactables"])

  # Marks these interactables used (absolute: the full list), and counts
  # them.
  def record_used!(identifiers)
    update!(used: identifiers.uniq, count: identifiers.uniq.length)
  end

  private

  def used_are_the_objectives
    return if used.blank?
    errors.add(:used, "is only for use objectives") unless use?
    unknown = used - interactables
    errors.add(:used, "has interactables the objective doesn't list: #{unknown.join(", ")}") if unknown.any?
  end
end
