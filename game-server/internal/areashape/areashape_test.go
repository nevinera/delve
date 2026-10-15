package areashape_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/areashape"
)

func TestShape_Contains(t *testing.T) {
	tests := []struct {
		name   string
		shape  areashape.Shape
		x, y   float64
		radius float64
		want   bool
	}{
		{"circle inside", areashape.Shape{Kind: areashape.Circle, X: 10, Y: 10, Radius: 5}, 12, 12, 0, true},
		{"circle outside", areashape.Shape{Kind: areashape.Circle, X: 10, Y: 10, Radius: 5}, 16, 10, 0, false},
		{"circle counts the unit's own radius", areashape.Shape{Kind: areashape.Circle, X: 10, Y: 10, Radius: 5}, 16, 10, 1.5, true},
		{"ring hole", areashape.Shape{Kind: areashape.Ring, InnerRadius: 4, OuterRadius: 8}, 2, 0, 0, false},
		{"ring band", areashape.Shape{Kind: areashape.Ring, InnerRadius: 4, OuterRadius: 8}, 6, 0, 0, true},
		{"ring beyond", areashape.Shape{Kind: areashape.Ring, InnerRadius: 4, OuterRadius: 8}, 9, 0, 0, false},
		{"ring hole edge overlapped by a big unit", areashape.Shape{Kind: areashape.Ring, InnerRadius: 4, OuterRadius: 8}, 3, 0, 1.5, true},
		{"line ahead (angle 0 points +y)", areashape.Shape{Kind: areashape.Line, Length: 20, Width: 4}, 1, 15, 0, true},
		{"line too wide", areashape.Shape{Kind: areashape.Line, Length: 20, Width: 4}, 3, 15, 0, false},
		{"line behind the origin", areashape.Shape{Kind: areashape.Line, Length: 20, Width: 4}, 0, -3, 0, false},
		{"line past its end", areashape.Shape{Kind: areashape.Line, Length: 20, Width: 4}, 0, 22, 0, false},
		{"line at 90 degrees points +x", areashape.Shape{Kind: areashape.Line, Angle: 90, Length: 20, Width: 4}, 10, 1, 0, true},
		{"line at 90 degrees misses +y", areashape.Shape{Kind: areashape.Line, Angle: 90, Length: 20, Width: 4}, 1, 10, 0, false},
		{"cone widens ahead", areashape.Shape{Kind: areashape.Cone, Offset: 4, Length: 24, Width: 16}, 7, 24, 0, true},
		{"cone is narrow near its point", areashape.Shape{Kind: areashape.Cone, Offset: 4, Length: 24, Width: 16}, 7, 5, 0, false},
		{"cone has nothing before its offset", areashape.Shape{Kind: areashape.Cone, Offset: 4, Length: 24, Width: 16}, 0, 2, 0, false},
		{"cone is a parabola, wider than a straight wedge at mid-length", areashape.Shape{Kind: areashape.Cone, Offset: 0, Length: 20, Width: 20}, 6, 10, 0, true},
		{"cone past its length", areashape.Shape{Kind: areashape.Cone, Offset: 0, Length: 20, Width: 20}, 0, 25, 0, false},
		{"unknown kind contains nothing", areashape.Shape{Kind: "blob"}, 0, 0, 0, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.shape.Contains(tt.x, tt.y, tt.radius))
		})
	}
}
