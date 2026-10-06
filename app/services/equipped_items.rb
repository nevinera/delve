module EquippedItems
  module_function

  # One equipped item as the game server (instanceconfig.EquippedItem) and
  # client expect it. Works on unsaved CharacterItems too (see
  # TraineeGear::Imaginary).
  def item_json(item)
    identity_json(item).merge(
      shield: item.source_json["shield"] == true,
      weapon_type: item.source_json["weaponType"],
      primary_stat: item.primary_stat,
      secondary_stats: item.secondary_stats,
      stats: ItemStats::Raw.call(character_item: item)
    )
  end

  def identity_json(item)
    {
      id: item.id,
      identifier: item.identifier,
      name: item.name,
      world_version_id: item.world_version_id,
      world_key: item.world_key,
      version: item.version,
      slot: item.slot,
      elvl: item.elvl
    }
  end
end
