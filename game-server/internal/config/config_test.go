package config_test

import (
	"testing"

	"github.com/delve-mmo/game-server/internal/config"
	"github.com/stretchr/testify/assert"
)

func TestLoad(t *testing.T) {
	tests := []struct {
		name      string
		env       map[string]string
		wantPort  string
		wantDebug bool
	}{
		{
			name:      "defaults",
			env:       map[string]string{},
			wantPort:  "8080",
			wantDebug: false,
		},
		{
			name:      "custom port",
			env:       map[string]string{"PORT": "9090"},
			wantPort:  "9090",
			wantDebug: false,
		},
		{
			name:      "debug true",
			env:       map[string]string{"DEBUG": "true"},
			wantPort:  "8080",
			wantDebug: true,
		},
		{
			name:      "debug 1",
			env:       map[string]string{"DEBUG": "1"},
			wantPort:  "8080",
			wantDebug: true,
		},
		{
			name:      "debug false",
			env:       map[string]string{"DEBUG": "false"},
			wantPort:  "8080",
			wantDebug: false,
		},
		{
			name:      "debug invalid defaults to false",
			env:       map[string]string{"DEBUG": "banana"},
			wantPort:  "8080",
			wantDebug: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("PORT", "")
			t.Setenv("DEBUG", "")
			for k, v := range tt.env {
				t.Setenv(k, v)
			}

			cfg := config.Load()

			assert.Equal(t, tt.wantPort, cfg.Port)
			assert.Equal(t, tt.wantDebug, cfg.Debug)
		})
	}
}
