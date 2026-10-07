# How far a CharacterQuest is through one of its objectives, identified by
# the objective's hash (QuestObjective.hash_of).
class QuestProgress < ApplicationRecord
  belongs_to :character_quest

  validates :objective_hash, presence: true
  validates :count, numericality: {only_integer: true, greater_than_or_equal_to: 0}
end
