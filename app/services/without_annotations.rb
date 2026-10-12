# A zone's data without its annotations (docs/schema/common.md#annotations),
# at every level they're allowed: the zone, its maps, places, units, NCUs,
# interactables and unit types. Annotations are notes for an LLM, never
# game state, so they're dropped before a zone goes to the game server. Only those levels:
# a dialogue node or an item could be keyed "annotations".
module WithoutAnnotations
  module_function

  def zone(data)
    return data unless data.is_a?(Hash)
    zone = data.except("annotations")
    zone["maps"] = each_of(zone["maps"]) { |map| map(map) } if zone.key?("maps")
    zone["unitTypes"] = zone["unitTypes"].transform_values { |unit_type| drop(unit_type) } if zone["unitTypes"].is_a?(Hash)
    zone
  end

  def map(data)
    return data unless data.is_a?(Hash)
    data.except("annotations").tap do |map|
      %w[places units ncus interactables].each { |key| map[key] = each_of(map[key]) { |entry| drop(entry) } if map.key?(key) }
    end
  end

  def drop(data) = data.is_a?(Hash) ? data.except("annotations") : data

  def each_of(list, &) = list.is_a?(Array) ? list.map(&) : list
end
