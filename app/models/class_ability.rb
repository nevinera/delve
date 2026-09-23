class ClassAbility < ApplicationRecord
  belongs_to :character_class

  validates :name, presence: true
  validates :position, presence: true, numericality: {only_integer: true, greater_than_or_equal_to: 0},
    uniqueness: {scope: :character_class_id}
end
