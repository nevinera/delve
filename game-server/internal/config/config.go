package config

import (
	"log/slog"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port       string
	Debug      bool
	AuthTokens []string
}

func Load() *Config {
	return &Config{
		Port:       port(),
		Debug:      debug(),
		AuthTokens: authTokens(),
	}
}

func port() string {
	if v := os.Getenv("PORT"); v != "" {
		return v
	}
	return "8080"
}

// authTokens parses GAME_SERVER_AUTH_TOKENS as a comma-separated list.
// Empty entries are dropped so stray commas are harmless.
func authTokens() []string {
	raw := os.Getenv("GAME_SERVER_AUTH_TOKENS")
	if raw == "" {
		return nil
	}
	var tokens []string
	for _, t := range strings.Split(raw, ",") {
		if t = strings.TrimSpace(t); t != "" {
			tokens = append(tokens, t)
		}
	}
	return tokens
}

func debug() bool {
	v := os.Getenv("DEBUG")
	if v == "" {
		return false
	}
	parsed, err := strconv.ParseBool(v)
	if err != nil {
		slog.Warn("invalid DEBUG value, defaulting to false", "value", v)
		return false
	}
	return parsed
}
