require "net/http"

module Bot
  # The ground of a continent, read from its surface plates (docs/formats/plates.md) as the play
  # page fetches them, and sampled as the browser's walker samples it (client/src/editor/walker.js
  # groundAt), so the bot stands where the server expects. Only heights and water: structures,
  # objects and trees don't get in its way.
  class Ground
    CELL_FT = 8.0
    TILE_CELLS = 64
    PLATE_FT = 16 * TILE_CELLS * CELL_FT
    SWIM_DEPTH = 4.5
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

    # Where the feet rest at (x, z), as [height, swimming]: the ground, or a swimming depth under
    # water too deep to stand in. Nil where the continent has no tile.
    def stand(x, z)
      sample = at(x, z) or return nil
      water = sample[:water]
      return [water - SWIM_DEPTH, true] if water && water - SWIM_DEPTH > sample[:ground]
      [sample[:ground], false]
    end

    private

    # A cell's [height, water] by its continent cell position, or nil.
    def cell(ci, cj)
      tx = ci.div(TILE_CELLS)
      tz = cj.div(TILE_CELLS)
      tile = plate(tx.div(16), tz.div(16))&.dig(tx, tz) or return nil
      k = (cj - tz * TILE_CELLS) * TILE_CELLS + (ci - tx * TILE_CELLS)
      [tile[:height][k], tile[:water][k]]
    end

    def plate(px, pz)
      return @plates[[px, pz]] if @plates.key?([px, pz])
      text = @fetch.call("#{@base}/#{px}_#{pz}.plate")
      @plates[[px, pz]] = text && Hash.new { |h, tx| h[tx] = {} }.tap { |tiles| read(text, tiles) }
    end

    # Reads each tile's height and water layers into tiles[tx][tz].
    def read(text, tiles)
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
