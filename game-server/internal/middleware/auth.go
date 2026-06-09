package middleware

import (
	"encoding/json"
	"net/http"
	"strings"
)

// TokenAuth returns a middleware that requires a valid Bearer token on every
// request. Tokens are checked against the provided set using a map for O(1)
// lookup — constant time regardless of how many tokens are configured.
//
// If no tokens are configured the middleware rejects all requests with 503
// rather than 401, so operators can distinguish "caller has no token" from
// "server was deployed without auth configured."
//
// Endpoints that should be publicly accessible (e.g. /status.json) must be
// mounted outside the route group this middleware is applied to.
func TokenAuth(tokens []string) func(http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(tokens))
	for _, t := range tokens {
		allowed[t] = struct{}{}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if len(allowed) == 0 {
				writeAuthError(w, http.StatusServiceUnavailable, "server is not configured for authenticated access")
				return
			}
			token := bearerToken(r)
			if token == "" {
				writeAuthError(w, http.StatusUnauthorized, "authorization required")
				return
			}
			if _, ok := allowed[token]; !ok {
				writeAuthError(w, http.StatusUnauthorized, "invalid token")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func bearerToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	token, found := strings.CutPrefix(auth, "Bearer ")
	if !found {
		return ""
	}
	return token
}

func writeAuthError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
