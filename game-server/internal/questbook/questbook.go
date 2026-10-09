// Package questbook loads a world's quests file (see plans/quests.md): a
// JSON array of quests, read from its pinned (commit SHA) URL and refused
// if its SHA1 doesn't match the checksum Rails recorded at import. The URL
// pins the content, so each file is fetched once per process and cached.
package questbook

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// MaxBytes caps a quests file's size.
const MaxBytes = 4 << 20

// Book loads and caches quests files.
type Book struct {
	HTTPClient *http.Client

	mu    sync.Mutex
	cache map[string][]instanceconfig.Quest // url → quests
}

// New returns a Book with a default HTTP client.
func New() *Book {
	return &Book{HTTPClient: &http.Client{Timeout: 10 * time.Second}}
}

// Load returns the quests at url, fetching and checking them against
// sha1Hex the first time.
func (b *Book) Load(url, sha1Hex string) ([]instanceconfig.Quest, error) {
	b.mu.Lock()
	if quests, ok := b.cache[url]; ok {
		b.mu.Unlock()
		return quests, nil
	}
	b.mu.Unlock()

	quests, err := b.fetch(url, sha1Hex)
	if err != nil {
		return nil, err
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.cache == nil {
		b.cache = make(map[string][]instanceconfig.Quest)
	}
	b.cache[url] = quests
	return quests, nil
}

func (b *Book) fetch(url, sha1Hex string) ([]instanceconfig.Quest, error) {
	resp, err := b.HTTPClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("fetch quests: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch quests %s: HTTP %d", url, resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, MaxBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read quests: %w", err)
	}
	if len(body) > MaxBytes {
		return nil, fmt.Errorf("quests file %s is over %d bytes", url, MaxBytes)
	}
	sum := sha1.Sum(body)
	if actual := hex.EncodeToString(sum[:]); actual != sha1Hex {
		return nil, fmt.Errorf("quests file %s has checksum %s, expected %s", url, actual, sha1Hex)
	}
	var quests []instanceconfig.Quest
	if err := json.Unmarshal(body, &quests); err != nil {
		return nil, fmt.Errorf("parse quests: %w", err)
	}
	return quests, nil
}
