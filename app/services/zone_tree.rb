# Sorts a recursive listing of zones/ into zone keys and map keys. Zones
# and maps share one convention - a directory holding a JSON file named
# after it (zones/goblin-cave/goblin-cave.json) - so slash-counting can't
# tell them apart once zone keys nest (zones/small/forest/forest.json).
# Instead: the shallowest "own file" on any branch is a zone, and an own
# file in a directory directly inside a zone's directory is one of its maps.
class ZoneTree
  def initialize(paths)
    @own_keys = paths.filter_map { |path| own_key(path) }.uniq.sort_by { |key| [key.count("/"), key] }
  end

  def zone_keys
    @zone_keys ||= @own_keys.each_with_object([]) do |key, zones|
      zones << key unless zones.any? { |zone| key.start_with?("#{zone}/") }
    end.sort
  end

  def map_keys
    @map_keys ||= @own_keys.select { |key| zone_keys.include?(File.dirname(key)) }.sort
  end

  private

  # "zones/small/forest/forest.json" -> "small/forest"; nil for anything
  # that isn't a directory's own file (.full.json/.layout.json companions,
  # images, stray json).
  def own_key(path)
    relative = path.delete_prefix("zones/")
    return nil unless relative.end_with?(".json") && !relative.end_with?(".full.json", ".layout.json")
    dir = File.dirname(relative)
    return nil if dir == "."
    (File.basename(relative, ".json") == File.basename(dir)) ? dir : nil
  end
end
