package server_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/server"
	"github.com/stretchr/testify/assert"
)

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
			h := server.New(instance.NewRegistry())
			req := httptest.NewRequest(tt.method, tt.path, nil)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			assert.Equal(t, tt.wantStatus, rec.Code)
		})
	}
}
