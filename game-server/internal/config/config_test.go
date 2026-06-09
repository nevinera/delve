package config_test

import (
	"testing"

	"github.com/delve-mmo/game-server/internal/config"
	"github.com/stretchr/testify/assert"
)

func TestLoad(t *testing.T) {
	tests := []struct {
		name           string
		env            map[string]string
		wantPort       string
		wantDebug      bool
		wantAuthTokens []string
	}{
		{
			name:           "defaults",
			env:            map[string]string{},
			wantPort:       "8080",
			wantDebug:      false,
			wantAuthTokens: nil,
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
		{
			name:           "single auth token",
			env:            map[string]string{"GAME_SERVER_AUTH_TOKENS": "abc123"},
			wantPort:       "8080",
			wantAuthTokens: []string{"abc123"},
		},
		{
			name:           "multiple auth tokens",
			env:            map[string]string{"GAME_SERVER_AUTH_TOKENS": "abc123,def456"},
			wantPort:       "8080",
			wantAuthTokens: []string{"abc123", "def456"},
		},
		{
			name:           "auth tokens with whitespace trimmed",
			env:            map[string]string{"GAME_SERVER_AUTH_TOKENS": "abc123, def456 , ghi789"},
			wantPort:       "8080",
			wantAuthTokens: []string{"abc123", "def456", "ghi789"},
		},
		{
			name:           "stray commas ignored",
			env:            map[string]string{"GAME_SERVER_AUTH_TOKENS": ",abc123,,"},
			wantPort:       "8080",
			wantAuthTokens: []string{"abc123"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("PORT", "")
			t.Setenv("DEBUG", "")
			t.Setenv("GAME_SERVER_AUTH_TOKENS", "")
			for k, v := range tt.env {
				t.Setenv(k, v)
			}

			cfg := config.Load()

			assert.Equal(t, tt.wantPort, cfg.Port)
			assert.Equal(t, tt.wantDebug, cfg.Debug)
			if tt.wantAuthTokens != nil {
				assert.Equal(t, tt.wantAuthTokens, cfg.AuthTokens)
			}
		})
	}
}
