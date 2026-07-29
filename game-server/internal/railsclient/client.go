package railsclient

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// Client posts award requests to the Rails internal API.
type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

// New constructs a Client. baseURL should not have a trailing slash.
func New(baseURL, token string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		token:   token,
		http:    &http.Client{Timeout: 10 * time.Second},
	}
}

// FromEnv reads RAILS_URL and RAILS_INTERNAL_TOKEN from the environment.
// Returns nil if either is absent, so callers can guard with a nil check.
func FromEnv() *Client {
	url := os.Getenv("RAILS_URL")
	token := os.Getenv("RAILS_INTERNAL_TOKEN")
	if url == "" || token == "" {
		return nil
	}
	return New(url, token)
}

type awardBody struct {
	Zone        zoneRef                  `json:"zone"`
	Identifier  string                   `json:"identifier"`
	Name        string                   `json:"name"`
	Slot        string                   `json:"slot"`
	Ilvl        int                      `json:"ilvl"`
	Description string                   `json:"description,omitempty"`
	Stats       instanceconfig.ItemStats `json:"stats"`
}

type zoneRef struct {
	DatabaseID string `json:"database_id"`
	Identifier string `json:"identifier"`
	Version    string `json:"version"`
}

// AwardItem posts a character item award to Rails. Returns nil on success
// (201 created) or if the item is already held (200 ok, idempotent).
func (c *Client) AwardItem(characterDatabaseID, zoneDatabaseID, zoneIdentifier, zoneVersion string, item instanceconfig.Item) error {
	body := awardBody{
		Zone:        zoneRef{DatabaseID: zoneDatabaseID, Identifier: zoneIdentifier, Version: zoneVersion},
		Identifier:  item.Identifier,
		Name:        item.Name,
		Slot:        item.Slot,
		Ilvl:        item.Ilvl,
		Description: item.Description,
		Stats:       item.Stats,
	}
	data, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	url := fmt.Sprintf("%s/internal_api/characters/%s/character_items", c.baseURL, characterDatabaseID)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Token", c.token)

	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("http: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusCreated || res.StatusCode == http.StatusOK {
		return nil
	}
	return fmt.Errorf("rails returned %d", res.StatusCode)
}
