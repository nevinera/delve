package pathing

import (
	"math/rand"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// gridGraph builds a MapGraph over an explicit blocked-cell layout, for
// exercising the search in isolation from barrier geometry.
func gridGraph(w, h int, blocked []bool) *MapGraph {
	bits := newBitGrid(w * h)
	for i, b := range blocked {
		if b {
			bits.set(i)
		}
	}
	g := &MapGraph{grid: cellGrid{cell: 1, w: w, h: h}, blocked: bits}
	g.labelComponents()
	return g
}

// dijkstraCost is brute-force shortest-path cost over the same movement
// rules as search, with no heuristic: the reference A* must match exactly.
func dijkstraCost(g *MapGraph, from, to int) (float64, bool) {
	w, h := g.grid.w, g.grid.h
	dist := make([]float64, w*h)
	for i := range dist {
		dist[i] = 1e18
	}
	dist[from] = 0
	done := make([]bool, w*h)
	for {
		u, best := -1, 1e18
		for i, d := range dist {
			if !done[i] && d < best {
				u, best = i, d
			}
		}
		if u == -1 {
			return 0, false
		}
		if u == to {
			return dist[u], true
		}
		done[u] = true
		ux, uy := u%w, u/w
		for _, o := range neighborOffsets {
			nx, ny := ux+o[0], uy+o[1]
			if !g.free(nx, ny) {
				continue
			}
			step := 1.0
			if o[0] != 0 && o[1] != 0 {
				if !g.free(ux+o[0], uy) || !g.free(ux, uy+o[1]) {
					continue
				}
				step = diagonalCost
			}
			if nd := dist[u] + step; nd < dist[ny*w+nx] {
				dist[ny*w+nx] = nd
			}
		}
	}
}

func TestSearch_MatchesDijkstraOnRandomGrids(t *testing.T) {
	rng := rand.New(rand.NewSource(7))
	checked := 0
	for trial := range 400 {
		w, h := 10+rng.Intn(30), 10+rng.Intn(30)
		density := 0.1 + rng.Float64()*0.3
		blocked := make([]bool, w*h)
		for i := range blocked {
			blocked[i] = rng.Float64() < density
		}
		g := gridGraph(w, h, blocked)

		for range 5 {
			from, to := rng.Intn(w*h), rng.Intn(w*h)
			if blocked[from] || blocked[to] {
				continue
			}
			want, reachable := dijkstraCost(g, from, to)
			path, got, ok := g.search(int32(from), int32(to))
			require.Equal(t, reachable, ok, "trial %d: reachability disagrees", trial)
			if !ok {
				continue
			}
			checked++
			assert.InDelta(t, want, got, 1e-3, "trial %d: %dx%d grid, %d->%d", trial, w, h, from, to)
			assert.Equal(t, int32(from), path[0])
			assert.Equal(t, int32(to), path[len(path)-1])
		}
	}
	assert.Greater(t, checked, 500, "test should exercise plenty of reachable pairs")
}

func TestSearch_DifferentComponentsUnreachableWithoutSearching(t *testing.T) {
	blocked := make([]bool, 5*5)
	for y := range 5 {
		blocked[y*5+2] = true // a solid wall down the middle column
	}
	g := gridGraph(5, 5, blocked)

	_, _, ok := g.search(0, 4)
	assert.False(t, ok)
}

func TestLabelComponents_OverflowStillAnswersCorrectly(t *testing.T) {
	// Isolated free cells on every even coordinate: 300*300 = 90000 separate
	// regions, more than fit in a 16-bit component id.
	const n = 600
	blocked := make([]bool, n*n)
	for y := range n {
		for x := range n {
			blocked[y*n+x] = x%2 == 1 || y%2 == 1
		}
	}
	// One real corridor, in the last rows, so overflow cells include a reachable pair.
	for x := range n {
		blocked[(n-2)*n+x] = false
	}
	g := gridGraph(n, n, blocked)

	first, last := 0, (n-2)*n+n-2 // an isolated cell, and a corridor cell
	assert.Equal(t, overflowComponent, g.comp[(n-2)*n], "past the id limit, regions share the overflow id")

	_, _, ok := g.search(int32(first), int32(2*n+2))
	assert.False(t, ok, "two isolated cells are unreachable even though their component ids may match")

	_, _, ok = g.search(int32((n-2)*n), int32(last))
	assert.True(t, ok, "cells in the same overflow region still route")
}
