// Package config reads the game server's settings from the environment.
package config

import "os"

// Config holds the game server's settings.
type Config struct {
	Port string
}

// Load reads the config from the environment, with defaults.
func Load() Config {
	return Config{Port: getenv("PORT", "8090")}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
