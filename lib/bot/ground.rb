require "json"
require "net/http"

module Bot
  # The ground of a continent as /create's builder walks it, and as the game server checks it
  # (game-server/internal/worlds/ground.go): heights and water from its version 2 plate files,
  # pressed down by level slabs, slabs and objects from its placed files, and the trees and objects
  # in the tiles' slots. Off the tiles is sea. Boulders across courses' cascades aren't in its way.
  class Ground
    EMPTY_FT = -100.0 # the sea floor's height where there are no tiles
    SWIM_DEPTH = 4.5
    STEP_FT = 2.5 # how high the walker steps up onto a slab, and what's lower isn't in its way
    HEAD_FT = 6.0 # how tall the walker is, for what's in its way
    MAX_CLIMB = Math.tan(50 * Math::PI / 180) # rise over run of the steepest slab it walks up
    BODY_HEIGHTS = [2, 3.5, 5].freeze # over the feet, where a move is checked against slabs
    SLOPE_FT = 2.0 # how far either way the ground's slope is taken under a slot
    NEAR_SHORE_FT = 16.0 # how far from water a slot can be on the shore
    TILE_FT = Plate::TILE_FT
    PLATE_FT = Plate::PLATE_FT
    CELL_FT = Plate::CELL_FT

    # fetch takes a URL and gives the body, or nil when there's nothing there.
    def initialize(repo:, sha:, continent:, fetch: method(:get))
      @base = "https://raw.githubusercontent.com/#{repo}/#{sha}/places/continents/#{continent}"
      @fetch = fetch
      @plates = {}
    end

    # The ground at continent feet (x, z) as {ground:, water:}, water nil where it's dry. Off the
    # tiles it's the sea's.
    def at(x, z)
      {ground: height_at(x, z) || EMPTY_FT, water: water_at(x, z)&.first}
    end

    # Where the feet rest at (x, z), for feet at `feet`, as [height, swimming]: the ground, or a
    # swimming depth under water too deep to stand in, or a slab's top, whichever is highest within
    # a step of the feet.
    def stand(x, z, feet = Float::INFINITY)
      sample = at(x, z)
      water = sample[:water]
      swim = !water.nil? && water - SWIM_DEPTH > sample[:ground]
      ground = swim ? water - SWIM_DEPTH : sample[:ground]
      heights = [ground, *footholds(x, z)]
      reachable = heights.select { _1 <= feet + STEP_FT }
      height = reachable.any? ? reachable.max : heights.min
      [height, swim && height == ground]
    end

    # Whether the straight move from a to b ([x, y, z], the feet's height) runs into a slab at the
    # bot's body height, or a tree or object. What it starts in doesn't stop it.
    def enters?(a, b)
      reach = Math.hypot(b[0] - a[0], b[2] - a[2])
      mx, mz = (a[0] + b[0]) / 2, (a[2] + b[2]) / 2
      return true if slabs_near(mx, mz, reach / 2).any? do |slab|
        BODY_HEIGHTS.any? { |up| slab.enters?([a[0], a[1] + up, a[2]], [b[0], b[1] + up, b[2]]) }
      end
      steps = (reach / 0.5).ceil
      things_near(mx, mz, reach / 2 + Slab::REACH_FT, b[1]).any? do |t|
        next false if Fill.inside?(t, a[0], a[2])
        (1..steps).any? { |n| Fill.inside?(t, a[0] + (b[0] - a[0]) * n / steps, a[2] + (b[2] - a[2]) * n / steps) }
      end
    end

    # The trees and objects in tile (tx, tz)'s slots, but under slabs.
    def fill(tx, tz)
      tile, plate, index = tile_at(tx, tz)
      return [] unless tile
      plate[:filled][index] ||= begin
        _, covered = pressed_tile(tx, tz)
        x0, z0 = tx * TILE_FT, tz * TILE_FT
        things = Fill.slots(tile[:slots], tx, tz, ->(i, j) { tile[:biome][j * Plate::TILE_CELLS + i] }, method(:slot_ground))
        things.reject { |t| covered[((t[:z] - z0) / CELL_FT).floor * Plate::TILE_CELLS + ((t[:x] - x0) / CELL_FT).floor] }
      end
    end

    # The height an object placed by hand stands at: its own, or on the slab under it, or on the
    # lowest ground under it, sunk a little (client/src/create/things.js objectY).
    def object_y(t)
      return t[:y] if t[:y]
      ground = ->(x, z) { height_at(x, z) || EMPTY_FT }
      here = ground.call(t[:x], t[:z])
      stand = [here, *footholds(t[:x], t[:z])].max
      return stand if stand > here
      f = t[:footprint]
      reach = f["circle"] || (f["rect"] ? f["rect"].min / 2.0 : 0)
      low = [[reach, 0], [-reach, 0], [0, reach], [0, -reach]].map { |dx, dz| ground.call(t[:x] + dx, t[:z] + dz) }.min
      [here, low].min - 0.1 * t[:height]
    end

    def placed_objects(px, pz) = plate(px, pz)&.dig(:objects) || []

    private

    def footholds(x, z) = slabs_near(x, z, 0).flat_map { _1.footholds(x, z, MAX_CLIMB) }

    # The ground's height, slope and water under a slot, as client/src/create/scatter.js has it.
    def slot_ground(x, z)
      s = SLOPE_FT
      nw, ne, sw, se = [[-s, -s], [s, -s], [-s, s], [s, s]].map { |dx, dz| height_at(x + dx, z + dz) || 0 }
      height = (nw + ne + sw + se) / 4
      near = nil
      [[0, 0], [NEAR_SHORE_FT, 0], [-NEAR_SHORE_FT, 0], [0, NEAR_SHORE_FT], [0, -NEAR_SHORE_FT]].each do |dx, dz|
        level, kind = water_at(x + dx, z + dz)
        next unless level
        near ||= {level: -Float::INFINITY, running: false}
        near[:level] = [near[:level], level].max
        near[:running] ||= Fill.running?(kind)
      end
      here, = water_at(x, z)
      if here && here > height
        near[:wet] = true
        near[:level] = here
      end
      [height, Fill.slope(nw, ne, sw, se, 2 * s), near]
    end

    # The trees and objects within `by` feet of (x, z) in the way of feet at y: those in the
    # tiles' slots whatever their height, and those placed by hand reaching over a step above the
    # feet and under the head.
    def things_near(x, z, by, y)
      near = ->(t) {
        r = Fill.reach(t[:footprint])
        (t[:x] - x).abs <= by + r && (t[:z] - z).abs <= by + r
      }
      tiles = range(z, by, TILE_FT).flat_map { |tz| range(x, by, TILE_FT).map { |tx| [tx, tz] } }
      filled = tiles.flat_map { fill(*_1) }.select(&near)
      placed = plates_near(x, z, by).flat_map { _1[:objects] }.select do |t|
        next false if !near.call(t) || t[:footprint]["open"].to_f.positive?
        bottom = object_y(t)
        bottom < y + HEAD_FT && bottom + t[:height] > y + STEP_FT
      end
      filled + placed
    end

    def range(v, by, size) = ((v - by) / size).floor..((v + by) / size).floor

    def tile_at(tx, tz)
      px, pz = tx.div(Plate::PLATE_TILES), tz.div(Plate::PLATE_TILES)
      p = plate(px, pz) or return nil
      index = (tz - pz * Plate::PLATE_TILES) * Plate::PLATE_TILES + tx - px * Plate::PLATE_TILES
      [p[:tiles][index], p, index]
    end

    # The ground's height at (x, z), pressed down by slabs, straight between cell corners, or nil
    # where there's no tile.
    def height_at(x, z)
      tx, tz = (x / TILE_FT).floor, (z / TILE_FT).floor
      heights, = pressed_tile(tx, tz)
      return nil unless heights
      u, v = (x - tx * TILE_FT) / CELL_FT, (z - tz * TILE_FT) / CELL_FT
      i, j = [Plate::CORNERS - 2, u.floor].min, [Plate::CORNERS - 2, v.floor].min
      fu, fv = u - i, v - j
      h = ->(a, b) { heights[(j + b) * Plate::CORNERS + i + a] }
      top = h[0, 0] + (h[1, 0] - h[0, 0]) * fu
      bottom = h[0, 1] + (h[1, 1] - h[0, 1]) * fu
      top + (bottom - top) * fv
    end

    # Tile (tx, tz)'s heights pressed down by slabs and the cells they cover, or nil.
    def pressed_tile(tx, tz)
      tile, plate, index = tile_at(tx, tz)
      return nil unless tile
      plate[:pressed][index] ||= begin
        slabs = plates_near((tx + 0.5) * TILE_FT, (tz + 0.5) * TILE_FT, TILE_FT).flat_map { _1[:slabs] }
        Press.pressed(tile[:heights], Press.over(slabs, tx, tz), tx, tz)
      end
    end

    # The water at (x, z) as [level, type], or nil where it's dry. Off the tiles it's the sea's.
    def water_at(x, z)
      tx, tz = (x / TILE_FT).floor, (z / TILE_FT).floor
      tile, = tile_at(tx, tz)
      return [0.0, 0] unless tile
      return nil unless tile[:level]
      k = ((z - tz * TILE_FT) / CELL_FT).floor * Plate::TILE_CELLS + ((x - tx * TILE_FT) / CELL_FT).floor
      level = tile[:level][k] or return nil
      [level, tile[:kind][k]]
    end

    def slabs_near(x, z, by)
      plates_near(x, z, by + Slab::REACH_FT * 2).flat_map { |p| p[:slabs].select { _1.near?(x, z, by) } }
    end

    def plates_near(x, z, reach)
      range(z, reach, PLATE_FT).flat_map { |pz| range(x, reach, PLATE_FT).filter_map { |px| plate(px, pz) } }
    end

    # Plate (px, pz)'s tiles, slabs and objects, or nil where it has neither a plate nor a placed
    # file.
    def plate(px, pz)
      return @plates[[px, pz]] if @plates.key?([px, pz])
      text = @fetch.call("#{@base}/plates/#{px}_#{pz}.plate")
      placed = @fetch.call("#{@base}/placed/#{px}_#{pz}.json")
      @plates[[px, pz]] = (text || placed) && {
        tiles: text ? Plate.read(text, px, pz) : {},
        **read_placed(placed),
        pressed: {},
        filled: {}
      }
    end

    # A placed file's slabs and objects (docs/formats/placed.md). An object without its footprint
    # and height kept takes its kind's, for a built-in kind; other kinds are in no one's way.
    def read_placed(text)
      json = text ? JSON.parse(text) : {}
      objects = (json["objects"] || []).filter_map do |o|
        footprint, height =
          if o["footprint"] && o["height"]
            [o["footprint"], o["height"]]
          elsif (spec = Fill::OBJECTS[o["type"]])
            [Fill.scaled(spec[1], o["scale"]), spec[2] * o["scale"]]
          end
        next unless footprint
        {type: o["type"], x: o["at"][0], z: o["at"][1], y: o["y"], yaw: o["yaw"] || 0, footprint:, height:, tree: false}
      end
      {slabs: (json["slabs"] || []).map { Slab.new(_1) }, objects:}
    end

    def get(url)
      response = Net::HTTP.get_response(URI(url))
      return nil if response.is_a?(Net::HTTPNotFound)
      response.value
      response.body
    end
  end
end
