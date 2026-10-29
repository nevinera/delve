// Package rails calls Rails's internal API (docs/formats/game-protocol.md, "Rails and the game
// server").
package rails

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// Client reaches Rails with a shared token.
type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

func New(baseURL, token string) *Client {
	return &Client{baseURL: strings.TrimRight(baseURL, "/"), token: token, http: &http.Client{Timeout: 10 * time.Second}}
}

// Position is where a character was in a world.
type Position struct {
	Continent string     `json:"continent"`
	At        [3]float64 `json:"at"`
	Yaw       float64    `json:"yaw"`
}

// Character is a character as it enters a world. Position is nil when it hasn't been there.
type Character struct {
	ID       int64           `json:"id"`
	Name     string          `json:"name"`
	Look     json.RawMessage `json:"look"`
	Position *Position       `json:"position"`
}

// Character fetches a character entering a world.
func (c *Client) Character(ctx context.Context, world, id int64) (Character, error) {
	var out Character
	err := c.get(ctx, fmt.Sprintf("/internal/worlds/%d/characters/%d", world, id), &out)
	return out, err
}

func (c *Client) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Internal-Token", c.token)
	req.Header.Set("Accept", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("rails: GET %s: %s", path, res.Status)
	}
	return json.NewDecoder(res.Body).Decode(out)
}
