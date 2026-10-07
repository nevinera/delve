# Awards a completed quest's rewards (docs/schema/quest.md): each is an
# item ({zone, item}) defined in one of the world character's current
# version's zones, read from that zone's file.
module QuestRewards
  module_function

  # The award requests (AwardCharacterItem's source_data) for rewards.
  # Reads zone files, so call it outside any transaction.
  def sources(world_character, rewards)
    rewards.group_by { |reward| reward["zone"] }.flat_map do |zone_key, zone_rewards|
      zone = world_character.world_version.zones.find_by!(identifier: zone_key)
      items = WorldContent.zone(zone)["items"] || {}
      zone_rewards.map { |reward| source_for(zone, items, reward["item"]) }
    end
  end

  def source_for(zone, items, item_key)
    definition = items[item_key] or raise ActiveRecord::RecordNotFound, "zone #{zone.identifier} has no item #{item_key}"
    definition.merge("identifier" => item_key, "zone" => {"database_id" => zone.id.to_s, "identifier" => zone.identifier})
  end

  # Awards each source, returning the items newly held ({identifier, name});
  # one already held in this version is skipped.
  def award!(world_character, sources)
    sources.filter_map do |source_data|
      result = AwardCharacterItem.call(world_character:, source_data:)
      item = Array(result).first
      {identifier: item.identifier, name: item.name} if item.is_a?(CharacterItem)
    end
  end
end
