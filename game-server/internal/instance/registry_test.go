package instance_test

import (
	"testing"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/stretchr/testify/assert"
)

func TestRegistry_Count(t *testing.T) {
	r := instance.NewRegistry()
	assert.Equal(t, 0, r.Count())
}
