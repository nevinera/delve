require "digest"

# A quest objective's hash identifies it across world versions: progress
# is kept on a QuestProgress row under the hash, so the same objective in
# a new version keeps its progress and a changed one starts over (see
# docs/quests.md#world-versions). Only these fields count, in this order,
# with blanks and the default count of 1 dropped; the game server and
# client use the hashes Rails returns rather than computing their own.
module QuestObjective
  FIELDS = %w[type zone ncu unit unitType count map].freeze

  module_function

  def normalize(objective)
    FIELDS.each_with_object({}) do |field, normalized|
      value = objective[field]
      next if value.nil? || value == "" || (field == "count" && value == 1)
      normalized[field] = value
    end
  end

  def hash_of(objective) = Digest::SHA1.hexdigest(normalize(objective).to_json)
end
