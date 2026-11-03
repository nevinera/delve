package worlds

import (
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/klauspost/compress/zstd"
)

// Plate files (.agents/formats.md, client/src/v2/plate.js): each tile's corner heights,
// cells' biomes, object slots and water. Cuts aren't read: nothing here needs them.

const (
	cellFt     = 4.0
	tileCells  = 64
	cellCorner = tileCells + 1
	chunkCells = 8
	tileChunks = tileCells / chunkCells
	TileFt     = tileCells * cellFt // 256
	plateTiles = 8
	PlateFt    = TileFt * plateTiles // 2,048

	plateVersion = 8
	levelOffset  = 32768
	nearDelta    = 31
	dryLevel     = "~~~"
)

// tile is one tile of a plate.
type tile struct {
	heights []float32 // cellCorner × cellCorner corners, row by row, feet
	biome   []uint8   // tileCells × tileCells cells, indexes into biomeNames
	slots   []byte    // slotBytes a slot
	level   []float32 // the water's surface over each cell, NaN where it's dry; nil for no water
	kind    []uint8   // each cell's water type, an index into waterTypes
}

const digitChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

var digitValue = func() (v [128]int8) {
	for i := range v {
		v[i] = -1
	}
	for i := 0; i < len(digitChars); i++ {
		v[digitChars[i]] = int8(i)
	}
	return v
}()

// readDigits reads `count` base64 digits from `at` in text, most significant first.
func readDigits(text string, at, count int) (int, error) {
	if at < 0 || at+count > len(text) {
		return 0, fmt.Errorf("digits past the end at %d", at)
	}
	n := 0
	for k := 0; k < count; k++ {
		c := text[at+k]
		if c >= 128 || digitValue[c] < 0 {
			return 0, fmt.Errorf("not a digit: %q at %d", c, at+k)
		}
		n = n*64 + int(digitValue[c])
	}
	return n, nil
}

// digitsToBytes reads bytes kept as digits, 3 bytes to 4 digits, the last group short.
func digitsToBytes(text string) ([]byte, error) {
	out := make([]byte, 0, len(text)*3/4)
	for i := 0; i < len(text); i += 4 {
		group := text[i:min(i+4, len(text))]
		n, err := readDigits(group+strings.Repeat("A", 4-len(group)), 0, 4)
		if err != nil {
			return nil, err
		}
		for k := 0; k < len(group)-1; k++ {
			out = append(out, byte(n>>(16-8*k)))
		}
	}
	return out, nil
}

var unzstd, _ = zstd.NewReader(nil)

// readPlate reads a plate file's tiles, by their index in the plate. Gzipped binary plate files,
// from before plate files were text, aren't read.
func readPlate(data []byte, px, pz int) (map[int]*tile, error) {
	if len(data) >= 2 && data[0] == 0x1f && data[1] == 0x8b {
		return nil, fmt.Errorf("a binary plate file, from before they were text: open and save the world in /create")
	}
	lines := strings.Split(string(data), "\n")
	head := strings.Fields(lines[0])
	if len(head) != 4 || head[0] != "plate" {
		return nil, fmt.Errorf("not a plate file")
	}
	if head[1] != strconv.Itoa(plateVersion) {
		return nil, fmt.Errorf("plate version %s, not %d", head[1], plateVersion)
	}
	tiles := map[int]*tile{}
	index := -1
	var own []string
	finish := func() error {
		if index < 0 {
			return nil
		}
		t, err := readTile(own, px*plateTiles+index%plateTiles, pz*plateTiles+index/plateTiles)
		if err != nil {
			return fmt.Errorf("tile %d: %w", index, err)
		}
		tiles[index] = t
		return nil
	}
	for _, line := range lines[1:] {
		if rest, ok := strings.CutPrefix(line, "tile "); ok {
			if err := finish(); err != nil {
				return nil, err
			}
			n, err := strconv.Atoi(rest)
			if err != nil || n < 0 || n >= plateTiles*plateTiles {
				return nil, fmt.Errorf("bad tile line %q", line)
			}
			index, own = n, nil
		} else if line != "" && index >= 0 {
			own = append(own, line)
		}
	}
	if err := finish(); err != nil {
		return nil, err
	}
	return tiles, nil
}

// readTile reads a tile's lines, (tx, tz) being where it is.
func readTile(lines []string, tx, tz int) (*tile, error) {
	of := func(tag string) []string {
		var out []string
		for _, line := range lines {
			if strings.HasPrefix(line, tag+" ") {
				out = append(out, line)
			}
		}
		return out
	}
	t := &tile{}
	var err error
	if t.heights, err = readHeights(of("h")); err != nil {
		return nil, err
	}
	if t.biome, err = readBiome(of("b")); err != nil {
		return nil, err
	}
	if t.slots, err = readSlots(of("s"), tx, tz); err != nil {
		return nil, err
	}
	if t.level, t.kind, err = readWater(of("w")); err != nil {
		return nil, err
	}
	return t, nil
}

// readHeights reads a tile's corner heights (client/src/v2/heights.js decodeTile).
func readHeights(lines []string) ([]float32, error) {
	heights := make([]float32, cellCorner*cellCorner)
	if len(lines) == 0 {
		return nil, fmt.Errorf("no heights")
	}
	if data, ok := strings.CutPrefix(lines[0], "h z "); ok {
		zipped, err := digitsToBytes(data)
		if err != nil {
			return nil, err
		}
		raw, err := unzstd.DecodeAll(zipped, nil)
		if err != nil {
			return nil, fmt.Errorf("unzipping heights: %w", err)
		}
		rows := strings.Split(string(raw), "\n")
		if len(rows) < cellCorner+1 {
			return nil, fmt.Errorf("zipped heights have %d lines", len(rows))
		}
		lo, err := readDigits(rows[0], 0, 3)
		if err != nil {
			return nil, err
		}
		for r := 0; r < cellCorner; r++ {
			q, _, err := deltas(rows[r+1], 0, lo-levelOffset, cellCorner)
			if err != nil {
				return nil, fmt.Errorf("heights row %d: %w", r, err)
			}
			for c, v := range q {
				heights[r*cellCorner+c] = float32(v) / 4
			}
		}
		return heights, nil
	}
	if lines[0] != "h c" {
		return nil, fmt.Errorf("unknown tile heights %q", lines[0][:min(8, len(lines[0]))])
	}
	parts := tileParts()
	if len(lines) != len(parts)+1 {
		return nil, fmt.Errorf("%d heights lines, not %d", len(lines)-1, len(parts))
	}
	for n, part := range parts {
		q, err := heightsLine(lines[n+1], 2, len(part))
		if err != nil {
			return nil, fmt.Errorf("heights line %d: %w", n, err)
		}
		for i, k := range part {
			heights[k] = float32(q[i]) / 4
		}
	}
	return heights, nil
}

// heightsLine reads `count` heights in quarter feet from a line at `at` (its format letter).
func heightsLine(text string, at, count int) ([]int, error) {
	if at >= len(text) {
		return nil, fmt.Errorf("empty heights line")
	}
	base, err := readDigits(text, at+1, 3)
	if err != nil {
		return nil, err
	}
	lo := base - levelOffset
	p := at + 4
	q := make([]int, count)
	switch text[at] {
	case 'f':
		for k := range q {
			q[k] = lo
		}
	case '1', '2':
		width := int(text[at] - '0')
		for k := range q {
			v, err := readDigits(text, p, width)
			if err != nil {
				return nil, err
			}
			q[k], p = lo+v, p+width
		}
	case '3':
		for k := range q {
			v, err := readDigits(text, p, 3)
			if err != nil {
				return nil, err
			}
			q[k], p = v-levelOffset, p+3
		}
	case 'd':
		q, _, err = deltas(text, p, lo, count)
		return q, err
	default:
		return nil, fmt.Errorf("unknown heights format %q", text[at])
	}
	return q, nil
}

// deltas reads `count` heights in d's form from `p`: each a space and 2 digits over lo, or a
// digit, its change from the one before plus nearDelta. Gives them and where they end.
func deltas(text string, p, lo, count int) ([]int, int, error) {
	q := make([]int, count)
	for k := 0; k < count; k++ {
		if p < len(text) && text[p] == ' ' {
			v, err := readDigits(text, p+1, 2)
			if err != nil {
				return nil, 0, err
			}
			q[k], p = lo+v, p+3
			continue
		}
		if k == 0 {
			return nil, 0, fmt.Errorf("a row starting with a change")
		}
		v, err := readDigits(text, p, 1)
		if err != nil {
			return nil, 0, err
		}
		q[k], p = q[k-1]+v-nearDelta, p+1
	}
	return q, p, nil
}

// tileParts are the corner indexes of each chunk's own 8×8 corners, in chunk order, then the far
// edge's: row 64, then column 64 down to row 63.
func tileParts() [][]int {
	var parts [][]int
	for cj := 0; cj < tileChunks; cj++ {
		for ci := 0; ci < tileChunks; ci++ {
			var part []int
			for j := 0; j < chunkCells; j++ {
				for i := 0; i < chunkCells; i++ {
					part = append(part, (cj*chunkCells+j)*cellCorner+ci*chunkCells+i)
				}
			}
			parts = append(parts, part)
		}
	}
	var edge []int
	for c := 0; c < cellCorner; c++ {
		edge = append(edge, (cellCorner-1)*cellCorner+c)
	}
	for r := 0; r < cellCorner-1; r++ {
		edge = append(edge, r*cellCorner+cellCorner-1)
	}
	return append(parts, edge)
}

// readBiome reads a tile's `b` line: runs of 2 digits of their length less one and a biome digit.
func readBiome(lines []string) ([]uint8, error) {
	biome := make([]uint8, tileCells*tileCells)
	if len(lines) == 0 {
		return biome, nil
	}
	line := lines[0]
	for p, k := 2, 0; p < len(line); p += 3 {
		run, err := readDigits(line, p, 2)
		if err != nil {
			return nil, err
		}
		b, err := readDigits(line, p+2, 1)
		if err != nil {
			return nil, err
		}
		for n := 0; n <= run && k < len(biome); n++ {
			biome[k] = uint8(b)
			k++
		}
	}
	return biome, nil
}

// readSlots reads a tile's `s` line: made from a seed, or kept as they are.
func readSlots(lines []string, tx, tz int) ([]byte, error) {
	if len(lines) == 0 {
		return makeSlots(tx, tz), nil
	}
	f := strings.Fields(lines[0])
	switch {
	case len(f) == 4 && f[1] == "s1":
		sx, err1 := strconv.Atoi(f[2])
		sz, err2 := strconv.Atoi(f[3])
		if err1 != nil || err2 != nil {
			return nil, fmt.Errorf("bad slots line %q", lines[0])
		}
		return makeSlots(sx, sz), nil
	case len(f) >= 2 && f[1] == "raw":
		data := ""
		if len(f) > 2 {
			data = f[2]
		}
		slots, err := digitsToBytes(data)
		if err != nil {
			return nil, err
		}
		return slots[:len(slots)-len(slots)%slotBytes], nil
	}
	return nil, fmt.Errorf("unknown slots line %q", lines[0])
}

// readWater reads a tile's `w` lines: each cell's level (NaN where it's dry) and type, or nils
// for a tile with none.
func readWater(lines []string) ([]float32, []uint8, error) {
	if len(lines) == 0 {
		return nil, nil, nil
	}
	if rest, ok := strings.CutPrefix(lines[0], "w all "); ok {
		lines = nil
		for c := 0; c < tileChunks*tileChunks; c++ {
			lines = append(lines, "w "+string(digitChars[c/64])+string(digitChars[c%64])+" "+rest)
		}
	}
	level := make([]float32, tileCells*tileCells)
	for k := range level {
		level[k] = float32(math.NaN())
	}
	kind := make([]uint8, tileCells*tileCells)
	const p = 7
	for _, line := range lines {
		chunk, err := readDigits(line, 2, 2)
		if err != nil || chunk >= tileChunks*tileChunks || len(line) <= 5 {
			return nil, nil, fmt.Errorf("bad water line %q", line)
		}
		mode := line[5]
		ci, cj := chunk%tileChunks*chunkCells, chunk/tileChunks*chunkCells
		for n := 0; n < chunkCells*chunkCells; n++ {
			at := p + 1
			switch mode {
			case '2':
				at = p + 1 + n*3
			case '3':
				at = p + n*3
			}
			if strings.HasPrefix(line[min(at, len(line)):], dryLevel) {
				continue
			}
			v, err := readDigits(line, at, 3)
			if err != nil {
				return nil, nil, err
			}
			typeAt := p
			if mode == '3' {
				typeAt = p + chunkCells*chunkCells*3 + n
			}
			t, err := readDigits(line, typeAt, 1)
			if err != nil {
				return nil, nil, err
			}
			k := (cj+n/chunkCells)*tileCells + ci + n%chunkCells
			level[k], kind[k] = float32(v-levelOffset)/4, uint8(t)
		}
	}
	return level, kind, nil
}
