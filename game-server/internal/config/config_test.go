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
