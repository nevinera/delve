package config

import (
	"log/slog"
	"os"
	"strconv"
)

type Config struct {
	Port  string
	Debug bool
}

func Load() *Config {
	return &Config{
		Port:  port(),
		Debug: debug(),
	}
}

func port() string {
	if v := os.Getenv("PORT"); v != "" {
		return v
	}
	return "8080"
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
