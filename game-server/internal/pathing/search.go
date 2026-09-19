package pathing

import (
	"math"
	"sync"
)

// searchScratch is the per-search working memory for the grid search: sized to the
// largest grid searched so far and reused across searches (and across grids)
// via a generation stamp, so a query never pays to clear or allocate
// O(cells) memory.
type searchScratch struct {
	stamp  []uint32
	g      []float32
	parent []int32
	gen    uint32
	heap   []heapItem
}

type heapItem struct {
	f   float32
	idx int32
}

var scratchPool = sync.Pool{New: func() any { return &searchScratch{} }}

func (s *searchScratch) reset(cells int) {
	if len(s.stamp) < cells {
		s.stamp = make([]uint32, cells)
		s.g = make([]float32, cells)
		s.parent = make([]int32, cells)
		s.gen = 0
	}
	s.gen++
	if s.gen == 0 { // wrapped: stale stamps could alias the new generation
		clear(s.stamp)
		s.gen = 1
	}
	s.heap = s.heap[:0]
}

func (s *searchScratch) push(it heapItem) {
	s.heap = append(s.heap, it)
	i := len(s.heap) - 1
	for i > 0 {
		p := (i - 1) / 2
		if s.heap[p].f <= s.heap[i].f {
			break
		}
		s.heap[p], s.heap[i] = s.heap[i], s.heap[p]
		i = p
	}
}

func (s *searchScratch) pop() heapItem {
	top := s.heap[0]
	last := len(s.heap) - 1
	s.heap[0] = s.heap[last]
	s.heap = s.heap[:last]
	i := 0
	for {
		l, r, m := 2*i+1, 2*i+2, i
		if l < last && s.heap[l].f < s.heap[m].f {
			m = l
		}
		if r < last && s.heap[r].f < s.heap[m].f {
			m = r
		}
		if m == i {
			break
		}
		s.heap[m], s.heap[i] = s.heap[i], s.heap[m]
		i = m
	}
	return top
}

var neighborOffsets = [8][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}, {1, 1}, {1, -1}, {-1, 1}, {-1, -1}}

const diagonalCost = math.Sqrt2

func (g *MapGraph) free(x, y int) bool {
	return x >= 0 && y >= 0 && x < g.grid.w && y < g.grid.h && !g.blocked.get(y*g.grid.w+x)
}

func octile(dx, dy int) float32 {
	if dx < 0 {
		dx = -dx
	}
	if dy < 0 {
		dy = -dy
	}
	return float32(max(dx, dy)) + (diagonalCost-1)*float32(min(dx, dy))
}

// search finds a shortest route over the free cells from cell `from` to cell
// `to` with A* (8-directional, octile heuristic), and returns the cells on it
// (inclusive of both ends) and its length in cell units. A diagonal step
// requires both orthogonal neighbors to be free, so a route never squeezes
// through the corner where two blocked cells touch (the same rule
// labelComponents uses). Callers must check the cells share a component
// first - an unreachable goal would otherwise flood the whole map.
//
// Jump Point Search was tried here and was ~20x slower on wall-cluttered
// maps: nearly every wall-side cell is a jump point, and the diagonal scans
// keep rescanning the same rows. Plain A* it is.
func (g *MapGraph) search(from, to int32) ([]int32, float64, bool) {
	if g.comp[from] != g.comp[to] {
		return nil, 0, false
	}
	if from == to {
		return []int32{from}, 0, true
	}
	s := scratchPool.Get().(*searchScratch)
	defer scratchPool.Put(s)
	s.reset(g.grid.w * g.grid.h)

	w := g.grid.w
	gx, gy := int(to)%w, int(to)/w
	s.stamp[from], s.g[from], s.parent[from] = s.gen, 0, -1
	s.push(heapItem{f: octile(int(from)%w-gx, int(from)/w-gy), idx: from})
	for len(s.heap) > 0 {
		cur := s.pop()
		ci := int(cur.idx)
		cx, cy := ci%w, ci/w
		if cur.idx == to {
			var path []int32
			for at := to; at != -1; at = s.parent[at] {
				path = append(path, at)
			}
			for i, j := 0, len(path)-1; i < j; i, j = i+1, j-1 {
				path[i], path[j] = path[j], path[i]
			}
			return path, float64(s.g[to]), true
		}
		if cur.f-octile(cx-gx, cy-gy) > s.g[cur.idx]+1e-3 {
			continue
		}
		for _, o := range neighborOffsets {
			nx, ny := cx+o[0], cy+o[1]
			if !g.free(nx, ny) {
				continue
			}
			step := float32(1)
			if o[0] != 0 && o[1] != 0 {
				if !g.free(cx+o[0], cy) || !g.free(cx, cy+o[1]) {
					continue
				}
				step = diagonalCost
			}
			ni := ny*w + nx
			ng := s.g[ci] + step
			if s.stamp[ni] == s.gen && ng >= s.g[ni] {
				continue
			}
			s.stamp[ni], s.g[ni], s.parent[ni] = s.gen, ng, cur.idx
			s.push(heapItem{f: ng + octile(nx-gx, ny-gy), idx: int32(ni)})
		}
	}
	return nil, 0, false
}
