# Decides whether an item's provenance (the world it was acquired in, and its
# elvl) passes a set of restriction layers - the world's and/or the zone's,
# each shaped like docs/schema/common.md#provenancerestrictions. An item must
# pass every layer. Trainee gear (no world) always passes.
#
# A layer's "worlds" is taken literally: nil means any world, a list means
# own world plus those listed. Callers resolve the schema defaults first (a
# world's missing "worlds" means [], a zone's means nil).
class ProvenanceRestrictions
  # layers: hashes with optional "worlds" and "maxElevation"; own_world_key:
  # the world the restrictions apply within, whose items always pass the
  # worlds check.
  def initialize(layers: [], own_world_key: nil)
    @layers = Array(layers).compact
    @own_world_key = own_world_key
  end

  def self.from_param(param, own_world_key: nil)
    new(layers: Array(param).map { |layer| layer.respond_to?(:to_unsafe_h) ? layer.to_unsafe_h : layer }, own_world_key:)
  end

  def allows?(item)
    world_key = item.world_version&.world&.key
    return true if world_key.nil?
    @layers.all? { |layer| layer_allows?(layer, world_key, item.elvl) }
  end

  private

  def layer_allows?(layer, world_key, elvl)
    worlds = layer["worlds"]
    max = layer["maxElevation"]
    return false if max && elvl > max.to_i
    return true if worlds.nil?
    world_key == @own_world_key || Array(worlds).include?(world_key)
  end
end
