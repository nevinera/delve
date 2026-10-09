# One objective of a CharacterQuest: its definition (normalized, see
# QuestObjective), its place in the quest's objectives, and how far the
# character is through it. Identified across world versions by the
# objective's hash.
class QuestProgress < ApplicationRecord
  belongs_to :character_quest

  validates :objective_hash, presence: true
  validates :position, numericality: {only_integer: true, greater_than_or_equal_to: 0}
  validates :count, numericality: {only_integer: true, greater_than_or_equal_to: 0}

  # How many times the objective must be met.
  def required = objective.fetch("count", 1)
end
