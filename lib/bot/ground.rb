require "json"
require "net/http"

module Bot
  # The ground of a continent, read from its surface plates (docs/formats/plates.md) as the play
  # page fetches them, and sampled as the browser's walker samples it (client/src/editor/walker.js
  # groundAt), so the bot stands where the server expects. Heights, water and slabs: structures,
  # objects and trees don't get in its way.
  class Ground
    CELL_FT = 8.0
    TILE_CELLS = 64
    PLATE_FT = 16 * TILE_CELLS * CELL_FT
    SWIM_DEPTH = 4.5
    STEP_FT = 1.5 # how high the walker steps up onto a slab
    MAX_CLIMB = 1.2 # rise over run of the steepest slab it walks up
    BODY_HEIGHTS = [2, 3.5, 5].freeze # over the feet, where a move is checked against slabs
    VALUES = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_".chars.each_with_index.to_h

    # fetch takes a URL and gives the body, or nil when there's nothing there.
    def initialize(repo:, sha:, continent:, fetch: method(:get))
      @base = "https://raw.githubusercontent.com/#{repo}/#{sha}/places/continents/#{continent}/plates/surface"
      @fetch = fetch
      @plates = {}
    end

    # The ground at continent feet (x, z) as {ground:, water:} (water nil where there's none), or
    # nil where the continent has no tile.
    def at(x, z)
      u = x / CELL_FT - 0.5
      v = z / CELL_FT - 0.5
      i = u.floor
      j = v.floor
      corners = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]].map { |a, b| cell(a, b)&.first }
      ground =
        if corners.all?
          fu = u - i
          fv = v - j
          top = corners[0] + (corners[1] - corners[0]) * fu
          bottom = corners[2] + (corners[3] - corners[2]) * fu
          top + (bottom - top) * fv
        else
          cell((u + 0.5).floor, (v + 0.5).floor)&.first
        end
      here = cell((x / CELL_FT).floor, (z / CELL_FT).floor)
      return nil if ground.nil? || here.nil?
      {ground:, water: here[1]}
    end

    # Where the feet rest at (x, z), for feet at `feet`, as [height, swimming]: the ground, or a
    # swimming depth under water too deep to stand in, or a slab's top, whichever is highest within
    # a step of the feet (client/src/world/walkIndex.js standOn). Nil where the continent has no
    # tile.
    def stand(x, z, feet = Float::INFINITY)
      sample = at(x, z) or return nil
      water = sample[:water]
      swim = !water.nil? && water - SWIM_DEPTH > sample[:ground]
      ground = swim ? water - SWIM_DEPTH : sample[:ground]
      heights = [ground, *slabs_near(x, z, 0).flat_map { _1.footholds(x, z, MAX_CLIMB) }]
      reachable = heights.select { _1 <= feet + STEP_FT }
      height = reachable.any? ? reachable.max : heights.min
      [height, swim && height == ground]
    end

    # Whether the straight move from a to b ([x, y, z], the feet's height) runs into a slab at the
    # bot's body height. A slab it starts in doesn't stop it.
    def enters?(a, b)
      reach = Math.hypot(b[0] - a[0], b[2] - a[2])
      slabs_near((a[0] + b[0]) / 2, (a[2] + b[2]) / 2, reach / 2).any? do |slab|
        BODY_HEIGHTS.any? { |up| slab.enters?([a[0], a[1] + up, a[2]], [b[0], b[1] + up, b[2]]) }
      end
    end

    private

    # A cell's [height, water] by its continent cell position, or nil.
    def cell(ci, cj)
      tx = ci.div(TILE_CELLS)
      tz = cj.div(TILE_CELLS)
      tile = plate(tx.div(16), tz.div(16))&.dig(:tiles, tx, tz) or return nil
      k = (cj - tz * TILE_CELLS) * TILE_CELLS + (ci - tx * TILE_CELLS)
      [tile[:height][k], tile[:water][k]]
    end

    # The slabs whose corners come within `by` feet of (x, z) across the ground, from its plate
    # and those beside it.
    def slabs_near(x, z, by)
      px, pz = (x / PLATE_FT).floor, (z / PLATE_FT).floor
      edge = Slab::REACH_FT * 2 + by
      [-1, 0, 1].product([-1, 0, 1]).flat_map do |dx, dz|
        next [] if (dx < 0 && x - px * PLATE_FT > edge) || (dx > 0 && (px + 1) * PLATE_FT - x > edge) ||
          (dz < 0 && z - pz * PLATE_FT > edge) || (dz > 0 && (pz + 1) * PLATE_FT - z > edge)
        (plate(px + dx, pz + dz)&.dig(:slabs) || []).select { _1.near?(x, z, by) }
      end
    end

    def plate(px, pz)
      return @plates[[px, pz]] if @plates.key?([px, pz])
      text = @fetch.call("#{@base}/#{px}_#{pz}.plate")
      @plates[[px, pz]] = text && {tiles: Hash.new { |h, tx| h[tx] = {} }, slabs: []}.tap { read(text, _1) }
    end

    # Reads each tile's height and water layers into plate[:tiles][tx][tz], and its slabs.
    def read(text, plate)
      tiles = plate[:tiles]
      lines = text.each_line(chomp: true)
      tile = nil
      loop do
        word, rest = lines.next.split(" ", 2)
        case word
        when "tile"
          coords, cells = rest.split
          raise ArgumentError, "tile #{coords} has #{cells} cells, not #{TILE_CELLS}" unless cells.to_i == TILE_CELLS
          tx, tz = coords.split(",").map { Integer(_1) }
          tile = tiles[tx][tz] = {height: nil, water: Array.new(TILE_CELLS**2)}
        when "layer"
          name, all = rest.split(" =", 2)
          rows = all ? nil : Array.new(TILE_CELLS) { lines.next }
          next unless tile && %w[height water].include?(name)
          tile[name.to_sym] = all ? Array.new(TILE_CELLS**2, level(all)) : rows.flat_map { |row| row.scan(/.../).map { level(_1) } }
        when "slab"
          plate[:slabs] << Slab.new(JSON.parse(rest))
        end
      end
      tiles.each_value { |column| column.each { |at, t| raise ArgumentError, "tile #{at} has no heights" unless t[:height] } }
    end

    # A height or water value: quarter feet above -256 ft, or ~~~ for none.
    def level(text)
      return nil if text == "~~~"
      text.each_char.reduce(0) { |n, c| n * 64 + VALUES.fetch(c) } / 4.0 - 256
    end

    def get(url)
      response = Net::HTTP.get_response(URI(url))
      return nil if response.is_a?(Net::HTTPNotFound)
      response.value
      response.body
    end
  end
end
