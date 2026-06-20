package config

import (
	"log/slog"
	"os"
	"strconv"
	"strings"
)

const defaultMaxSlots = 25
const defaultMaxInstances = 200

type Config struct {
	Port         string
	Debug        bool
	AuthTokens   []string
	MaxSlots     int
	MaxInstances int
}

func Load() *Config {
	return &Config{
		Port:         port(),
		Debug:        debug(),
		AuthTokens:   authTokens(),
		MaxSlots:     maxSlots(),
		MaxInstances: maxInstances(),
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

// maxSlots parses GAME_MAX_SLOTS. Defaults to instance.DefaultMaxSlots if
// unset or unparseable.
func maxSlots() int {
	v := os.Getenv("GAME_MAX_SLOTS")
	if v == "" {
		return defaultMaxSlots
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 {
		slog.Warn("invalid GAME_MAX_SLOTS value, using default", "value", v, "default", defaultMaxSlots)
		return defaultMaxSlots
	}
	return n
}

// maxInstances parses GAME_MAX_INSTANCES. Defaults to 200 if unset or unparseable.
func maxInstances() int {
	v := os.Getenv("GAME_MAX_INSTANCES")
	if v == "" {
		return defaultMaxInstances
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 {
		slog.Warn("invalid GAME_MAX_INSTANCES value, using default", "value", v, "default", defaultMaxInstances)
		return defaultMaxInstances
	}
	return n
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
