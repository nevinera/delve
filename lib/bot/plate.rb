require "zstd-ruby"

module Bot
  # A version 2 plate file's tiles (docs/formats/v2-plates.md, client/src/v2/plate.js): each tile's
  # corner heights, cells' biomes, object slots and water, by its index in the plate.
  module Plate
    CELL_FT = 4.0
    TILE_CELLS = 64
    CORNERS = TILE_CELLS + 1
    CHUNK = 8
    TILE_FT = TILE_CELLS * CELL_FT
    PLATE_TILES = 8
    PLATE_FT = TILE_FT * PLATE_TILES
    OFFSET = 32768
    NEAR = 31
    DIGITS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    VALUES = DIGITS.chars.each_with_index.to_h

    module_function

    # {index => {heights:, biome:, slots:, level:, kind:}}; level and kind nil for a tile with no
    # water, and level nil for each dry cell.
    def read(text, px, pz)
      raise ArgumentError, "a binary plate file, from before they were text" if text.start_with?("\x1f\x8b".b)
      lines = text.split("\n")
      word, version = lines.first.to_s.split
      raise ArgumentError, "not a plate file" unless word == "plate"
      raise ArgumentError, "plate version #{version}, not 8" unless version == "8"
      tiles = {}
      own = nil
      finish = lambda do
        next unless own
        index, rest = own
        tiles[index] = tile(rest, px * PLATE_TILES + index % PLATE_TILES, pz * PLATE_TILES + index / PLATE_TILES)
      end
      lines.drop(1).each do |line|
        if line.start_with?("tile ")
          finish.call
          own = [Integer(line[5..]), []]
        elsif !line.empty? && own
          own[1] << line
        end
      end
      finish.call
      tiles
    end

    def tile(lines, tx, tz)
      of = ->(tag) { lines.select { _1.start_with?("#{tag} ") } }
      level, kind = water(of.call("w"))
      {heights: heights(of.call("h")), biome: biome(of.call("b").first), slots: slots(of.call("s").first, tx, tz), level:, kind:}
    end

    def digits(text, at, count)
      (0...count).reduce(0) { |n, k| n * 64 + VALUES.fetch(text[at + k]) }
    end

    def bytes(text)
      text.scan(/.{1,4}/).flat_map do |group|
        n = digits(group.ljust(4, "A"), 0, 4)
        (0...group.length - 1).map { |k| (n >> (16 - 8 * k)) & 255 }
      end
    end

    # A tile's 65×65 corner heights in feet (client/src/v2/heights.js decodeTile).
    def heights(lines)
      out = Array.new(CORNERS * CORNERS)
      if lines.first&.start_with?("h z ")
        rows = Zstd.decompress(bytes(lines.first[4..]).pack("C*")).split("\n")
        lo = digits(rows[0], 0, 3) - OFFSET
        CORNERS.times do |r|
          deltas(rows[r + 1], 0, lo, CORNERS).each_with_index { |q, c| out[r * CORNERS + c] = q / 4.0 }
        end
        return out
      end
      raise ArgumentError, "unknown tile heights #{lines.first.inspect}" unless lines.first == "h c"
      parts.each_with_index do |part, n|
        line(lines.fetch(n + 1), 2, part.length).each_with_index { |q, i| out[part[i]] = q / 4.0 }
      end
      out
    end

    def line(text, at, count)
      lo = digits(text, at + 1, 3) - OFFSET
      p = at + 4
      case text[at]
      when "f" then Array.new(count, lo)
      when "1" then (0...count).map { lo + digits(text, p + _1, 1) }
      when "2" then (0...count).map { lo + digits(text, p + _1 * 2, 2) }
      when "3" then (0...count).map { digits(text, p + _1 * 3, 3) - OFFSET }
      when "d" then deltas(text, p, lo, count)
      else raise ArgumentError, "unknown heights format #{text[at].inspect}"
      end
    end

    def deltas(text, p, lo, count)
      q = []
      count.times do
        if text[p] == " "
          q << lo + digits(text, p + 1, 2)
          p += 3
        else
          q << q.last + digits(text, p, 1) - NEAR
          p += 1
        end
      end
      q
    end

    # Each chunk's own 8×8 corners in chunk order, then the far edge's.
    def parts
      @parts ||= begin
        chunks = (0...CHUNK).flat_map do |cj|
          (0...CHUNK).map do |ci|
            (0...CHUNK).flat_map { |j| (0...CHUNK).map { |i| (cj * CHUNK + j) * CORNERS + ci * CHUNK + i } }
          end
        end
        chunks + [(0...CORNERS).map { (CORNERS - 1) * CORNERS + _1 } + (0...CORNERS - 1).map { _1 * CORNERS + CORNERS - 1 }]
      end
    end

    def biome(line)
      out = Array.new(TILE_CELLS * TILE_CELLS, 0)
      return out unless line
      k = 0
      2.step(line.length - 1, 3) do |p|
        run = digits(line, p, 2) + 1
        out.fill(digits(line, p + 2, 1), k, run)
        k += run
      end
      out.first(TILE_CELLS * TILE_CELLS)
    end

    def slots(line, tx, tz)
      _, kind, *rest = (line || "s s1 #{tx} #{tz}").split
      case kind
      when "s1" then Fill.make_slots(*rest.map { Integer(_1) })
      when "raw" then (b = bytes(rest.first.to_s)).first(b.length - b.length % 4)
      else raise ArgumentError, "unknown slots line #{line.inspect}"
      end
    end

    def water(lines)
      return [nil, nil] if lines.empty?
      if lines.first.start_with?("w all ")
        rest = lines.first[6..]
        lines = (0...64).map { |c| "w #{DIGITS[c / 64]}#{DIGITS[c % 64]} #{rest}" }
      end
      level = Array.new(TILE_CELLS * TILE_CELLS)
      kind = Array.new(TILE_CELLS * TILE_CELLS, 0)
      lines.each do |line|
        chunk = digits(line, 2, 2)
        mode = line[5]
        ci, cj = chunk % CHUNK * CHUNK, chunk / CHUNK * CHUNK
        (CHUNK * CHUNK).times do |n|
          at = {"2" => 8 + n * 3, "3" => 7 + n * 3}.fetch(mode, 8)
          next if line[at, 3] == "~~~"
          k = (cj + n / CHUNK) * TILE_CELLS + ci + n % CHUNK
          level[k] = (digits(line, at, 3) - OFFSET) / 4.0
          kind[k] = digits(line, (mode == "3") ? 7 + CHUNK * CHUNK * 3 + n : 7, 1)
        end
      end
      [level, kind]
    end
  end
end
