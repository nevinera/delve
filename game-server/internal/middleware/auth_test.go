package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/middleware"
)

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
}

func callWith(tokens []string, authHeader string) *httptest.ResponseRecorder {
	h := middleware.TokenAuth(tokens)(okHandler())
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestTokenAuth(t *testing.T) {
	tests := []struct {
		name       string
		tokens     []string
		authHeader string
		wantStatus int
	}{
		{
			name:       "valid token passes through",
			tokens:     []string{"secret"},
			authHeader: "Bearer secret",
			wantStatus: http.StatusOK,
		},
		{
			name:       "second of multiple tokens accepted",
			tokens:     []string{"old-token", "new-token"},
			authHeader: "Bearer new-token",
			wantStatus: http.StatusOK,
		},
		{
			name:       "first of multiple tokens still accepted",
			tokens:     []string{"old-token", "new-token"},
			authHeader: "Bearer old-token",
			wantStatus: http.StatusOK,
		},
		{
			name:       "missing authorization header",
			tokens:     []string{"secret"},
			authHeader: "",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "wrong token",
			tokens:     []string{"secret"},
			authHeader: "Bearer wrong",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "non-bearer scheme rejected",
			tokens:     []string{"secret"},
			authHeader: "Basic secret",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "no tokens configured returns 503",
			tokens:     []string{},
			authHeader: "Bearer secret",
			wantStatus: http.StatusServiceUnavailable,
		},
		{
			name:       "nil tokens configured returns 503",
			tokens:     nil,
			authHeader: "Bearer secret",
			wantStatus: http.StatusServiceUnavailable,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := callWith(tt.tokens, tt.authHeader)
			assert.Equal(t, tt.wantStatus, rec.Code)
		})
	}
}

func TestTokenAuth_ErrorResponseIsJSON(t *testing.T) {
	rec := callWith([]string{"secret"}, "")
	assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))
}
