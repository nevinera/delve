module EquippedItems
  module_function

  # One equipped item as the game server (instanceconfig.EquippedItem) and
  # client expect it. Works on unsaved CharacterItems too (see
  # TraineeGear::Imaginary).
  def item_json(item)
    {
      identifier: item.identifier,
      name: item.name,
      source_key: item.source_key,
      zone_identifier: item.zone_identifier,
      version: item.version,
      slot: item.slot,
      elvl: item.elvl,
      shield: item.source_json["shield"] == true,
      weapon_type: item.source_json["weaponType"],
      primary_stat: item.primary_stat,
      secondary_stats: item.secondary_stats,
      stats: ItemStats::Raw.call(character_item: item)
    }
  end
end
