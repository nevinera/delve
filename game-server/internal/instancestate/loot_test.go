package instancestate

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func TestResolveLootCount_IntegerAndRange(t *testing.T) {
	require.Equal(t, 3, resolveLootCount([2]float64{3, 3}))
	require.Equal(t, 0, resolveLootCount([2]float64{0, 0}))

	for i := 0; i < 50; i++ {
		n := resolveLootCount([2]float64{2, 4})
		require.GreaterOrEqual(t, n, 2)
		require.LessOrEqual(t, n, 4)
	}
}

func TestResolveLootCount_FractionalIsProbability(t *testing.T) {
	require.Equal(t, 0, resolveLootCount([2]float64{0, 0}), "0 never drops")

	var got1 bool
	for i := 0; i < 200; i++ {
		n := resolveLootCount([2]float64{1, 1})
		require.Equal(t, 1, n)
		got1 = true
	}
	require.True(t, got1)

	sawZero, sawOne := false, false
	for i := 0; i < 500; i++ {
		n := resolveLootCount([2]float64{0.5, 0.5})
		require.Contains(t, []int{0, 1}, n)
		if n == 0 {
			sawZero = true
		} else {
			sawOne = true
		}
	}
	require.True(t, sawZero, "0.5 should sometimes drop nothing across 500 rolls")
	require.True(t, sawOne, "0.5 should sometimes drop one item across 500 rolls")
}

func TestRollLoot_FractionalCountEitherAllOrNothing(t *testing.T) {
	table := map[string]int{"trinket": 1}
	catalog := map[string]instanceconfig.Item{
		"trinket": {Identifier: "trinket", Name: "Trinket"},
	}

	sawEmpty, sawOne := false, false
	for i := 0; i < 500; i++ {
		result := rollLoot(table, [2]float64{0.5, 0.5}, catalog)
		require.LessOrEqual(t, len(result), 1)
		if len(result) == 0 {
			sawEmpty = true
		} else {
			sawOne = true
			require.Equal(t, "trinket", result[0].Item.Identifier)
		}
	}
	require.True(t, sawEmpty)
	require.True(t, sawOne)
}
