package config

import "testing"

func TestLoadDefaultsPort(t *testing.T) {
	t.Setenv("PORT", "")
	if got := Load().Port; got != "8090" {
		t.Errorf("Port = %q, want 8090", got)
	}
}

func TestLoadReadsPort(t *testing.T) {
	t.Setenv("PORT", "9000")
	if got := Load().Port; got != "9000" {
		t.Errorf("Port = %q, want 9000", got)
	}
}

func TestCheckNeedsTheSecrets(t *testing.T) {
	t.Setenv("GAME_TOKEN_SECRET", "")
	t.Setenv("RAILS_INTERNAL_TOKEN", "x")
	if Load().Check() == nil {
		t.Error("Check passed without GAME_TOKEN_SECRET")
	}
	t.Setenv("GAME_TOKEN_SECRET", "s")
	if err := Load().Check(); err != nil {
		t.Errorf("Check = %v, want nil", err)
	}
}
