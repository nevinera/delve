// Package token checks the entry tokens Rails signs (docs/formats/game-protocol.md, "Entry tokens").
package token

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// Claims say who may enter which world, until when.
type Claims struct {
	User      int64  `json:"user"`
	Character int64  `json:"character"`
	World     int64  `json:"world"`
	Repo      string `json:"repo"`
	Sha       string `json:"sha"`
	Exp       int64  `json:"exp"`
}

var (
	ErrMalformed = errors.New("malformed token")
	ErrSignature = errors.New("bad token signature")
	ErrExpired   = errors.New("token expired")
)

// Verify checks a token's signature and expiry and returns what it says.
func Verify(secret, raw string, now time.Time) (Claims, error) {
	body, sig, ok := strings.Cut(raw, ".")
	if !ok {
		return Claims{}, ErrMalformed
	}
	got, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil {
		return Claims{}, ErrMalformed
	}
	if !hmac.Equal(got, Sign(secret, body)) {
		return Claims{}, ErrSignature
	}
	payload, err := base64.RawURLEncoding.DecodeString(body)
	if err != nil {
		return Claims{}, ErrMalformed
	}
	var c Claims
	if err := json.Unmarshal(payload, &c); err != nil || c.Character == 0 || c.World == 0 || c.Repo == "" || c.Sha == "" {
		return Claims{}, ErrMalformed
	}
	if now.Unix() >= c.Exp {
		return Claims{}, ErrExpired
	}
	return c, nil
}

// Sign gives a token body's signature.
func Sign(secret, body string) []byte {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(body))
	return mac.Sum(nil)
}

// Issue makes a token, as Rails does; for tests.
func Issue(secret string, c Claims) string {
	payload, _ := json.Marshal(c)
	body := base64.RawURLEncoding.EncodeToString(payload)
	return body + "." + base64.RawURLEncoding.EncodeToString(Sign(secret, body))
}
