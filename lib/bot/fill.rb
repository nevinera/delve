require "json"

module Bot
  # What fills tiles' object slots (client/src/v2/slots.js, fill.js, create/scatter.js): the trees
  # and objects in the bot's way. Each is {type:, x:, z:, yaw:, footprint:, height:, tree:}.
  module Fill
    SLOT_SEED = 0x736c6f74
    SIZES = %w[small medium large].freeze
    GRIDS = [[2, 32], [1, 16], [0, 16]].freeze
    # client/src/v2/biomes.js's BIOME_NAMES.
    BIOMES = [
      "plains", "forest", "rocky", "swamp",
      "autumn forest", "giant woods", "taiga", "blossom valley", "bamboo grove", "snowy forest", "highlands",
      "savanna", "red canyon", "sand desert", "salt flats",
      "jungle", "primeval valley", "tropical coast", "sandy beach",
      "snowfield", "frozen tundra", "glacier",
      "mangrove", "fungal marsh",
      "haunted woods", "plague lands", "volcanic waste", "corrupted waste", "enchanted glade", "crystal forest"
    ].freeze
    WATER_TYPES = %w[sea lake pond swamp river stream].freeze
    TREE_ROOM = [0, 8, 12, 17].freeze
    TREE_SIZES = {1 => [60, 2.5], 2 => [90, 4], 3 => [120, 6]}.freeze # height, trunk
    TREE_KINDS = {
      "oak" => [1, 1], "pine" => [1.15, 0.8], "willow" => [0.9, 1.2], "dead" => [0.85, 0.8],
      "autumn" => [1, 1], "giant" => [1.35, 2], "spruce" => [1.2, 0.8], "snowpine" => [1.15, 0.8], "blossom" => [0.8, 0.9],
      "bamboo" => [0.7, 0.5], "acacia" => [0.8, 0.7], "palm" => [1, 0.45], "treefern" => [0.55, 0.6], "jungle" => [1.2, 1.1],
      "mangrove" => [0.6, 0.7], "giantcap" => [0.55, 1.3], "gnarled" => [0.8, 1], "blighted" => [0.8, 0.9], "charred" => [0.7, 0.8],
      "thorn" => [0.75, 0.9], "silverleaf" => [1.05, 0.85], "crystal" => [0.6, 1]
    }.freeze
    # client/src/world/objects.js's OBJECT_TYPES: size range, footprint and height at scale 1.
    OBJECTS = {
      "boulder" => [[3, 8], {"circle" => 0.45}, 0.8],
      "outcrop" => [[2.5, 4], {"rect" => [2.6, 1.6]}, 1],
      "bush" => [[3, 5], {"circle" => 0.42}, 0.95],
      "fence" => [[3.5, 4.5], {"rect" => [2.6, 0.2]}, 1],
      "log" => [[25, 50], {"capsule" => [0.1, 0.5]}, 0.2],
      "stump" => [[3, 6], {"circle" => 0.8}, 1],
      "mossyBoulder" => [[3, 6], {"circle" => 0.45}, 0.85],
      "thicket" => [[4, 6], {"circle" => 0.7}, 0.95],
      "uprooted" => [[60, 110], {"capsule" => [0.045, 0.5]}, 0.24],
      "rock" => [[4, 15], {"circle" => 0.45}, 0.8],
      "spire" => [[10, 25], {"circle" => 0.15}, 1],
      "rubble" => [[4, 8], {"circle" => 0.5}, 0.35],
      "deadStump" => [[3, 6], {"circle" => 0.8}, 1],
      "rottingLog" => [[20, 45], {"capsule" => [0.1, 0.5]}, 0.2],
      "hollowStump" => [[4, 7], {"circle" => 0.8}, 1],
      "rootTangle" => [[4, 7], {"circle" => 0.55}, 0.7],
      "hummock" => [[2, 3.5], {"circle" => 1.1}, 1],
      "driftLog" => [[15, 35], {"capsule" => [0.07, 0.5]}, 0.14]
    }.freeze
    STEEP_DEG = 50
    SLOPE_DEG = 22
    SHORE_FT = 3
    SHALLOW_FT = 1.5
    BUCKET_FT = 32.0

    module_function

    def table
      @table ||= JSON.parse(File.read(File.expand_path("../../client/src/v2/fill.json", __dir__)))
    end

    # A number from 0 to 1 for (ix, iz) and a seed (client/src/world/noise.js hash2).
    def hash2(ix, iz, seed)
      m = 0xffffffff
      h = (((ix & m) * 0x27d4eb2d) & m) ^ (((iz & m) * 0x165667b1) & m) ^ (seed & m)
      h = ((h ^ (h >> 15)) * 0x85ebca6b) & m
      h = ((h ^ (h >> 13)) * 0xc2b2ae35) & m
      h ^= h >> 16
      h / 4294967296.0
    end

    def make_slots(tx, tz)
      GRIDS.flat_map do |size, every|
        n = (Plate::TILE_FT / every).to_i
        seed = SLOT_SEED + size * 4
        (0...n).flat_map do |j|
          (0...n).flat_map do |i|
            ci, cj = tx * n + i, tz * n + j
            [i * every + (hash2(ci, cj, seed) * every).floor, j * every + (hash2(ci, cj, seed + 1) * every).floor, size, (hash2(ci, cj, seed + 2) * 256).floor]
          end
        end
      end
    end

    def scaled(footprint, scale)
      # An open footprint doesn't scale.
      footprint.to_h { |shape, v| [shape, (shape == "open") ? v : (v.is_a?(Array) ? v.map { _1 * scale } : v * scale)] }
    end

    def reach(footprint)
      return footprint["open"] if footprint["open"].to_f.positive?
      return footprint["circle"] if footprint["circle"]
      return footprint["capsule"].sum if footprint["capsule"]
      Math.hypot(*footprint["rect"]) / 2
    end

    def ground_class(slope, height, water)
      return "bed" if water&.dig(:wet)
      return "steep" if slope >= STEEP_DEG
      return (water[:running] ? "bank" : "shore") if water && height < water[:level] + SHORE_FT
      (slope >= SLOPE_DEG) ? "slope" : "flat"
    end

    def pick_from(entries, roll, fine)
      past = (roll + fine) / 256.0
      (entries || []).each do |entry|
        return entry if past < entry["share"]
        past -= entry["share"]
      end
      nil
    end

    # What stands in tile (tx, tz)'s slots: biome_at(i, j) gives a cell's biome, and
    # ground_at(x, z) [height, slope in degrees, water].
    def slots(slots, tx, tz, biome_at, ground_at)
      out = []
      room = Hash.new { |h, k| h[k] = [] }
      bucket = ->(x, z) { [(x / BUCKET_FT).floor, (z / BUCKET_FT).floor] }
      crowded = lambda do |x, z, r|
        bi, bj = bucket.call(x, z)
        (bj - 1..bj + 1).any? { |j| (bi - 1..bi + 1).any? { |i| room.fetch([i, j], []).any? { |px, pz, pr| Math.hypot(px - x, pz - z) < pr + r } } }
      end
      slots.each_slice(4) do |sx, sz, size, roll|
        next unless SIZES[size]
        x, z = tx * Plate::TILE_FT + sx + 0.5, tz * Plate::TILE_FT + sz + 0.5
        fine = hash2(x.floor, z.floor, SLOT_SEED + 32)
        height, slope, water = ground_at.call(x, z)
        kind = ground_class(slope, height, water)
        next if kind == "steep" || (kind == "bed" && water[:level] - height > SHALLOW_FT)
        entry =
          if %w[bank shore bed].include?(kind)
            pick_from(table.dig("banks", water[:running] ? "running" : "still", SIZES[size]), roll, fine)
          else
            pick_from(table.dig("biomes", BIOMES[biome_at.call(sx >> 2, sz >> 2)].to_s, SIZES[size]), roll, fine)
          end
        next unless entry
        pick = ->(n) { hash2(x.floor, z.floor, SLOT_SEED + 16 + n) }
        if entry["tree"]
          r = TREE_ROOM[entry["size"]]
          next if crowded.call(x, z, r)
          room[bucket.call(x, z)] << [x, z, r]
          size_height, trunk = TREE_SIZES.fetch(entry["size"])
          kind_height, kind_trunk = TREE_KINDS.fetch(entry["tree"], TREE_KINDS["oak"])
          out << {type: entry["tree"], x:, z:, yaw: 0, footprint: {"circle" => trunk * kind_trunk}, height: size_height * kind_height, tree: true}
          next
        end
        # A built object says its own, since it isn't one of OBJECTS.
        sizes, footprint, tall = entry["footprint"] ? [entry["scales"], entry["footprint"], entry["height"]] : OBJECTS[entry["object"]]
        next unless footprint
        scale = sizes[0] + (sizes[1] - sizes[0]) * pick.call(0)
        object = {type: entry["object"], x:, z:, yaw: pick.call(1) * Math::PI * 2, footprint: scaled(footprint, scale), height: tall * scale, tree: false}
        r = reach(object[:footprint])
        next if crowded.call(x, z, r)
        room[bucket.call(x, z)] << [x, z, r]
        out << object
      end
      out
    end

    def slope(nw, ne, sw, se, width)
      dx = (ne - nw + se - sw) / 2
      dz = (sw - nw + se - ne) / 2
      Math.atan(Math.hypot(dx, dz) / width) * 180 / Math::PI
    end

    def running?(kind) = %w[stream river].include?(WATER_TYPES[kind])

    # Whether (x, z) is inside a thing's footprint by more than `leeway`.
    def inside?(thing, x, z, leeway = 0.25)
      f = thing[:footprint]
      c, s = Math.cos(thing[:yaw]), -Math.sin(thing[:yaw])
      if f["open"].to_f.positive?
        false
      elsif f["circle"]
        Math.hypot(x - thing[:x], z - thing[:z]) < f["circle"] - leeway
      elsif f["capsule"]
        r, half = f["capsule"]
        ax, az, bx, bz = thing[:x] - c * half, thing[:z] - s * half, thing[:x] + c * half, thing[:z] + s * half
        dx, dz = bx - ax, bz - az
        l = dx * dx + dz * dz
        u = l.positive? ? (((x - ax) * dx + (z - az) * dz) / l).clamp(0, 1) : 0
        Math.hypot(x - ax - dx * u, z - az - dz * u) < r - leeway
      else
        w, d = f["rect"]
        u, v = (x - thing[:x]) * c + (z - thing[:z]) * s, -(x - thing[:x]) * s + (z - thing[:z]) * c
        u.abs < w / 2.0 - leeway && v.abs < d / 2.0 - leeway
      end
    end
  end
end
