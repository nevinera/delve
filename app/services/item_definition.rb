require "digest"

# An item's version is a hash of its own definition (docs/schema/item.md),
# so re-releasing a world only "upgrades" items whose definitions actually
# changed. Both sides that produce a definition must hash the same: the
# zone file's item (when Rails works out what a character already owns)
# and the game server's award request (railsclient.AwardItem, whose JSON
# omits empty optional fields) - so only the fields the game server sends
# count, and empty values are dropped.
module ItemDefinition
  FIELDS = %w[identifier name slot elvl shield weaponType primary secondaries description].freeze

  module_function

  def normalize(definition)
    FIELDS.each_with_object({}) do |field, normalized|
      value = definition[field]
      next if value.nil? || value == false || value == "" || value == []
      normalized[field] = (field == "secondaries") ? value.sort : value
    end
  end

  def version(definition) = Digest::SHA1.hexdigest(normalize(definition).to_json)
end
