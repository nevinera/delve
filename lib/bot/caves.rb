require "zstd-ruby"

module Bot
  # A plate's caves file (.agents/formats.md, client/src/v2/caves.js): the air its caves open
  # in each 2 ft column of its tiles, as [floor, ceiling] spans, lowest first. A bot stands on a
  # cave's floor, smoothed as /create smooths it, and can't walk into its rock.
  module Caves
    VOXEL_FT = 2.0
    TILE_COLUMNS = (Plate::TILE_FT / VOXEL_FT).to_i # 128
    COLUMNS = TILE_COLUMNS * TILE_COLUMNS
    OFFSET = 32768 # added to heights written absolutely, in quarter feet
    C2_MOST = 31 # the most spans a column has in c2; digits over it are runs of empty columns
    SMOOTH_COLUMNS = 2 # how far round a floor its smoothing reaches

    module_function

    # {index => columns}, each tile's COLUMNS columns of spans, nil for rock all the way down. Files
    # from before networks, and the gzipped binary files before them, have no caves.
    def read(text)
      return {} if text.start_with?("\x1f\x8b".b)
      lines = text.split("\n")
      word, version = lines.first.to_s.split
      raise ArgumentError, "not a caves file" unless word == "caves"
      return {} if version == "1"
      raise ArgumentError, "caves file version #{version} isn't known" unless version == "2"
      tiles = {}
      k = 1
      while k < lines.length
        word, index = lines[k].split
        k += 1
        next unless word == "tile"
        raise ArgumentError, "tile #{index} has no cells" if k >= lines.length
        columns = cells(lines[k])
        k += 1
        into = tiles[Integer(index)]
        next tiles[Integer(index)] = columns unless into
        # Another network's spans in the same tile.
        columns.each_with_index do |column, c|
          into[c] = [*into[c], *column].sort_by(&:first) if column
        end
      end
      tiles
    end

    # A tile's columns from its cells' line: c1, c2 or c3, zipped or not.
    def cells(line)
      tag, text = line.split(" ", 2)
      raise ArgumentError, "cells line has no form" unless text
      if tag.end_with?("z")
        tag, text = tag.chomp("z"), Zstd.decompress(Plate.bytes(text).pack("C*"))
      end
      columns = Array.new(COLUMNS)
      span = ->(at, start_digits, base) {
        floor = (Plate.digits(text, at + 3, start_digits) + base) / 4.0
        [floor, floor + Plate.digits(text, at + 3 + start_digits, 2) / 4.0]
      }
      case tag
      when "c1"
        at = 3
        Plate.digits(text, 0, 2).times do
          c = Plate.digits(text, at, 3)
          raise ArgumentError, "column #{c} is past the tile" if c >= COLUMNS
          (columns[c] ||= []) << span.call(at + 3, 6, -OFFSET)
          at += 15
        end
        return columns
      when "c2", "c3" then nil
      else raise ArgumentError, "caves cells form #{tag.inspect} isn't known"
      end
      c2 = tag == "c2"
      base, at = c2 ? [Plate.digits(text, 0, 3) - OFFSET, 4] : [-OFFSET, 0]
      counts = []
      while counts.length < COLUMNS
        d = Plate.digits(text, at, 1)
        at += 1
        if c2 && d > C2_MOST
          counts.concat([0] * (d - 30))
        else
          counts << d
        end
      end
      at += 1
      size, start_digits = c2 ? [7, 2] : [11, 6]
      counts.first(COLUMNS).each_with_index do |count, c|
        count.times do
          (columns[c] ||= []) << span.call(at, start_digits, base)
          at += size
        end
      end
      columns
    end

    # The span in `spans` whose floor is within `reach` of span s's and whose air overlaps it.
    def joined(spans, s, reach)
      spans.find { |t| (t[0] - s[0]).abs <= reach && t[0] < s[1] && t[1] > s[0] }
    end

    # Span s's floor in continent column (ci, cj), smoothed: the mean of the floors joined to it
    # round it, kept within a voxel of its own. spans_at(ci, cj) gives a column's spans.
    def smooth_floor(spans_at, ci, cj, s)
      floors = (-SMOOTH_COLUMNS..SMOOTH_COLUMNS).flat_map do |dj|
        (-SMOOTH_COLUMNS..SMOOTH_COLUMNS).filter_map do |di|
          next s[0] if di.zero? && dj.zero?
          joined(spans_at.call(ci + di, cj + dj), s, VOXEL_FT * [di.abs, dj.abs].max)&.first
        end
      end
      (floors.sum / floors.size).clamp(s[0] - VOXEL_FT, s[0] + VOXEL_FT)
    end

    # Span s's smooth floor at continent feet (x, z), between the smoothed floors at the middles
    # of the four columns round it, those not joined to it taking its own.
    def floor_at(spans_at, x, z, s)
      ci, cj = (x / VOXEL_FT).floor, (z / VOXEL_FT).floor
      own = smooth_floor(spans_at, ci, cj, s)
      u, v = x / VOXEL_FT - 0.5, z / VOXEL_FT - 0.5
      i0, j0 = u.floor, v.floor
      at = ->(i, j) {
        next own if i == ci && j == cj
        t = joined(spans_at.call(i, j), s, VOXEL_FT)
        t ? smooth_floor(spans_at, i, j, t) : own
      }
      fu, fv = u - i0, v - j0
      (at[i0, j0] * (1 - fu) + at[i0 + 1, j0] * fu) * (1 - fv) + (at[i0, j0 + 1] * (1 - fu) + at[i0 + 1, j0 + 1] * fu) * fv
    end
  end
end
