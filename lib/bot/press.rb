module Bot
  # Level slabs press the ground down where they lie in it (client/src/create/press.js): every
  # corner of each cell a slab covers any of is no higher than the slab's bottom, and nothing grows
  # in those cells.
  module Press
    LEVEL_FT = 0.01 # how far a slab's top may rise across it and still be level
    CELL_FT = Plate::CELL_FT
    TILE_FT = Plate::TILE_FT

    module_function

    # A level slab's outline from above and its bottom's height, as [outline, bottom], or nil.
    def pressing(slab)
      top = slab.outline.map { |u, v| add(slab.at, Slab.turn_point([u, 0, v], slab.turn)) }
      ys = top.map { _1[1] }
      return nil if top.empty? || ys.max - ys.min > LEVEL_FT
      [top.map { |x, _, z| [x, z] }, add(top.first, Slab.turn_point([0, -slab.thickness, 0], slab.turn))[1]]
    end

    # What `slabs` press on tile (tx, tz) or its edge corners.
    def over(slabs, tx, tz)
      x0, z0, x1, z1 = tx * TILE_FT - CELL_FT, tz * TILE_FT - CELL_FT, (tx + 1) * TILE_FT + CELL_FT, (tz + 1) * TILE_FT + CELL_FT
      slabs.filter_map { pressing(_1) }.select do |outline, _|
        xs, zs = outline.transpose
        xs.min < x1 && xs.max > x0 && zs.min < z1 && zs.max > z0
      end
    end

    # A tile's corner heights pressed down by `presses`, and {cell index => true} for the cells
    # they cover. Pressed heights are kept as the client keeps them, in single floats.
    def pressed(heights, presses, tx, tz)
      corners = {}
      cells = {}
      x0, z0 = tx * TILE_FT, tz * TILE_FT
      presses.each do |outline, bottom|
        xs, zs = outline.transpose
        i0, i1 = [-1, ((xs.min - x0) / CELL_FT).floor].max, [Plate::TILE_CELLS, ((xs.max - x0) / CELL_FT).floor].min
        j0, j1 = [-1, ((zs.min - z0) / CELL_FT).floor].max, [Plate::TILE_CELLS, ((zs.max - z0) / CELL_FT).floor].min
        (j0..j1).each do |j|
          (i0..i1).each do |i|
            next unless overlaps?(outline, x0 + i * CELL_FT, z0 + j * CELL_FT)
            cells[j * Plate::TILE_CELLS + i] = true if i >= 0 && j >= 0 && i < Plate::TILE_CELLS && j < Plate::TILE_CELLS
            [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]].each do |a, b|
              next if a < 0 || b < 0 || a >= Plate::CORNERS || b >= Plate::CORNERS
              k = b * Plate::CORNERS + a
              corners[k] = [corners.fetch(k, Float::INFINITY), bottom].min
            end
          end
        end
      end
      return [heights, cells] if corners.empty?
      out = heights.dup
      corners.each { |k, h| out[k] = [h].pack("f").unpack1("f") if out[k] > h }
      [out, cells]
    end

    # Whether the polygon covers any of the cell with its northwest corner at (x, z), beyond
    # touching its edge.
    def overlaps?(polygon, x, z)
      square = [[x, z], [x + CELL_FT, z], [x + CELL_FT, z + CELL_FT], [x, z + CELL_FT]]
      return true if inside?(polygon, [x + CELL_FT / 2, z + CELL_FT / 2])
      return true if polygon.any? { |px, pz| px > x && px < x + CELL_FT && pz > z && pz < z + CELL_FT }
      polygon.each_with_index.any? do |p, n|
        q = polygon[(n + 1) % polygon.size]
        (0...4).any? { |m| crosses?(p, q, square[m], square[(m + 1) % 4]) }
      end
    end

    def inside?(polygon, (x, z))
      into = false
      polygon.each_with_index do |(x0, z0), i|
        x1, z1 = polygon[(i + 1) % polygon.size]
        into = !into if (z0 > z) != (z1 > z) && x < x0 + (z - z0) * (x1 - x0) / (z1 - z0)
      end
      into
    end

    # Whether segments pq and rs cross, not counting where they only touch.
    def crosses?(p, q, r, s)
      side = ->(a, b, c) { ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) <=> 0 }
      side.call(p, q, r) * side.call(p, q, s) < 0 && side.call(r, s, p) * side.call(r, s, q) < 0
    end

    def add(a, b) = a.zip(b).map(&:sum)
  end
end
