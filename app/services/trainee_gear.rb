# Trainee Gear: the starter set every class can fill (see docs/stats.md,
# "Trainee Gear"), generated from the class by TraineeGear::Generate.
module TraineeGear
  module_function

  def identifier_for(equipped_slot) = "trainee-#{equipped_slot}"

  # CharacterItem attributes for one generated item, at elvl.
  def item_attrs(equipped_slot, item, elvl: 0)
    {
      identifier: identifier_for(equipped_slot),
      name: item.name,
      version: "0.0",
      slot: item.slot,
      elvl:,
      primary_stat: item.primary_stat,
      secondary_stats: item.secondary_stats,
      source_json: {"shield" => item.shield, "weaponType" => item.weapon_type}
    }
  end
end
