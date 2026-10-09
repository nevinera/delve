module Validators
  # A world's quests file: an array of quests (docs/schema/quest.md), with
  # unique identifiers and one chainName per chainIdentifier.
  class QuestsValidator < Base
    def validate!(data, path: "$")
      raise ValidationError.new("must be an array of quests", path: path) unless data.is_a?(Array)
      data.each_with_index { |quest, i| QuestValidator.validate!(quest, path: index_path(path, i)) }
      validate_unique_identifiers!(data, path: path)
      validate_chain_names!(data, path: path)
    end

    private

    def validate_unique_identifiers!(quests, path:)
      seen = Set.new
      quests.each_with_index do |quest, i|
        next if seen.add?(quest["identifier"])
        raise ValidationError.new("duplicate quest identifier \"#{quest["identifier"]}\"", path: child_path(index_path(path, i), "identifier"))
      end
    end

    def validate_chain_names!(quests, path:)
      names = {}
      quests.each_with_index do |quest, i|
        name = names[quest["chainIdentifier"]] ||= quest["chainName"]
        next if name == quest["chainName"]
        message = "chainName must match the other quests in chain \"#{quest["chainIdentifier"]}\" (\"#{name}\")"
        raise ValidationError.new(message, path: child_path(index_path(path, i), "chainName"))
      end
    end
  end
end
