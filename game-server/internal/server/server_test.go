package server_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/config"
	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/server"
)

const testToken = "test-token-abc"

func newServer() http.Handler {
	return server.New(instance.NewRegistry(), &config.Config{
		AuthTokens: []string{testToken},
		MaxSlots:   25,
	})
}

func TestRouting(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		path       string
		wantStatus int
	}{
		{
			name:       "GET /status.json returns 200",
			method:     http.MethodGet,
			path:       "/status.json",
			wantStatus: http.StatusOK,
		},
		{
			name:       "POST /slots/active returns 405",
			method:     http.MethodPost,
			path:       "/slots/active",
			wantStatus: http.StatusMethodNotAllowed,
		},
		{
			name:       "unknown route returns 404",
			method:     http.MethodGet,
			path:       "/unknown",
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "wrong method on /status.json returns 405",
			method:     http.MethodPost,
			path:       "/status.json",
			wantStatus: http.StatusMethodNotAllowed,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, nil)
			rec := httptest.NewRecorder()
			newServer().ServeHTTP(rec, req)
			assert.Equal(t, tt.wantStatus, rec.Code)
		})
	}
}

func TestAuth(t *testing.T) {
	tests := []struct {
		name       string
		path       string
		authHeader string
		wantStatus int
	}{
		{
			name:       "status is public",
			path:       "/status.json",
			authHeader: "",
			wantStatus: http.StatusOK,
		},
		{
			name:       "slots/active requires auth",
			path:       "/slots/active",
			authHeader: "",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "slots/active accepts valid token",
			path:       "/slots/active",
			authHeader: "Bearer " + testToken,
			wantStatus: http.StatusOK,
		},
		{
			name:       "instances requires auth",
			path:       "/instances",
			authHeader: "",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "instances accepts valid token",
			path:       "/instances",
			authHeader: "Bearer " + testToken,
			wantStatus: http.StatusOK,
		},
		{
			name:       "instances rejects wrong token",
			path:       "/instances",
			authHeader: "Bearer wrong-token",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "instance show requires auth",
			path:       "/instances/00000000-0000-0000-0000-000000000001",
			authHeader: "",
			wantStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			if tt.authHeader != "" {
				req.Header.Set("Authorization", tt.authHeader)
			}
			rec := httptest.NewRecorder()
			newServer().ServeHTTP(rec, req)
			assert.Equal(t, tt.wantStatus, rec.Code)
		})
	}
}

func TestAuth_NoTokensConfigured(t *testing.T) {
	h := server.New(instance.NewRegistry(), &config.Config{MaxSlots: 25})
	req := httptest.NewRequest(http.MethodGet, "/instances", nil)
	req.Header.Set("Authorization", "Bearer anything")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusInternalServerError, rec.Code)
}
