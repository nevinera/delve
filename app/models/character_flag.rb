# A yes/no fact about a character in a world: "this character has done this
# thing here" (see plans/flags.md). Written "<type>/<identifier>" wherever
# it's shown or referenced (quest/completed/killMoreOrcs), but stored as
# two columns. Flags belong to the world, not a version, and are never
# revoked; world_version is the version it was first granted under.
class CharacterFlag < ApplicationRecord
  TYPES = %w[quest kill clear key zone met custom].freeze
  IDENTIFIER_FORMAT = %r{\A[A-Za-z0-9_/-]{1,64}\z}

  belongs_to :world_character
  belongs_to :world_version, optional: true

  validates :flag_type, inclusion: {in: TYPES}
  validates :identifier, format: {with: IDENTIFIER_FORMAT, message: "must be 1-64 letters, digits, _, - or /"}

  # {flag_type:, identifier:} for a "type/identifier" string, or nil if it
  # isn't a valid flag.
  def self.parse(flag)
    flag_type, identifier = flag.to_s.split("/", 2)
    return unless TYPES.include?(flag_type) && identifier&.match?(IDENTIFIER_FORMAT)
    {flag_type:, identifier:}
  end

  def self.valid_flag?(flag) = parse(flag).present?

  # The given "type/identifier" strings that world_character holds, in the
  # order given. Invalid strings are never held.
  def self.held(world_character, flags)
    flags = Array(flags)
    held = matching(flags).where(world_character:).pluck(:flag_type, :identifier).to_set { |t, i| "#{t}/#{i}" }
    flags.select { |flag| held.include?(flag) }.uniq
  end

  # The rows any of flags could be (in any world character).
  def self.matching(flags)
    parsed = flags.filter_map { |flag| parse(flag) }
    return none if parsed.empty?
    parsed.group_by { |f| f[:flag_type] }
      .map { |flag_type, group| where(flag_type:, identifier: group.pluck(:identifier)) }
      .reduce(:or)
  end

  def self.held?(world_character, flag) = held(world_character, [flag]).any?

  # Grants flag to world_character, under its current world version. A no-op
  # (keeping the first grant's version) when it's already held. Raises
  # ActiveRecord::RecordInvalid for an invalid flag.
  def self.grant!(world_character, flag)
    flag_type, identifier = flag.to_s.split("/", 2)
    create_with(world_version_id: world_character.world_version_id)
      .create_or_find_by!(world_character:, flag_type:, identifier: identifier.to_s)
  end

  def to_s = "#{flag_type}/#{identifier}"
end
