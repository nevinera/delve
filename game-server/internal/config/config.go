// Package config reads the game server's settings from the environment.
package config

import (
	"errors"
	"os"
)

// Config holds the game server's settings.
type Config struct {
	Port string
	// TokenSecret checks entry tokens; Rails signs them with the same secret.
	TokenSecret string
	// RailsURL and RailsToken reach Rails's internal API.
	RailsURL   string
	RailsToken string
	// CacheDir keeps released worlds' zips.
	CacheDir string
	// GitHubURL is GitHub's API, where worlds are downloaded from.
	GitHubURL string
}

// Load reads the config from the environment, with defaults.
func Load() Config {
	return Config{
		Port:        getenv("PORT", "8090"),
		TokenSecret: os.Getenv("GAME_TOKEN_SECRET"),
		RailsURL:    getenv("RAILS_URL", "http://localhost:8000"),
		RailsToken:  os.Getenv("RAILS_INTERNAL_TOKEN"),
		CacheDir:    getenv("WORLD_CACHE_DIR", "tmp/worlds"),
		GitHubURL:   getenv("GITHUB_API_URL", "https://api.github.com"),
	}
}

// Check says what's missing that the server can't run without.
func (c Config) Check() error {
	if c.TokenSecret == "" {
		return errors.New("GAME_TOKEN_SECRET isn't set")
	}
	if c.RailsToken == "" {
		return errors.New("RAILS_INTERNAL_TOKEN isn't set")
	}
	return nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
