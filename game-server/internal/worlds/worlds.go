// Package worlds downloads released worlds and reads what the game server needs from them. Each
// released commit's zip is kept on disk, keyed by repo and sha, so it's downloaded once.
package worlds

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// World is what the game server knows of a released world.
type World struct {
	Repo, Sha    string
	Continents   []string
	Spawn        Spawn
	Dummies      []Dummy         // training dummies
	RestPoints   []RestPoint     // places characters can make their home
	Classes      []*combat.Class // by id
	path, prefix string          // the zip it was read from, and its top directory
}

// Spawn is where characters new to the world start: a continent and a place in its feet.
type Spawn struct {
	Continent string     `json:"continent"`
	At        [2]float64 `json:"at"`
}

// Dummy is a training dummy placed on a continent, at a place in its feet.
type Dummy struct {
	Continent string     `json:"continent"`
	At        [2]float64 `json:"at"`
}

// RestPoint is a place on a continent a character can make its home, which Homeward takes it to.
type RestPoint struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	Continent string     `json:"continent"`
	At        [2]float64 `json:"at"`
	// Area is where characters are resting, [x, z] corners in continent feet, or none.
	Area [][2]float64 `json:"area"`
}

// Resting says whether a place on a continent is in a rest point's area.
func (w *World) Resting(continent string, x, z float64) bool {
	for _, r := range w.RestPoints {
		if r.Continent == continent && len(r.Area) >= 3 && inPolygon(r.Area, [2]float64{x, z}) {
			return true
		}
	}
	return false
}

// RestPoint is the rest point with that id, or nil.
func (w *World) RestPoint(id string) *RestPoint {
	for i := range w.RestPoints {
		if w.RestPoints[i].ID == id {
			return &w.RestPoints[i]
		}
	}
	return nil
}

// Store downloads worlds into a directory, one download per world at a time.
type Store struct {
	dir       string
	githubURL string
	http      *http.Client
	mu        sync.Mutex
	loading   map[string]*sync.Mutex
}

func NewStore(dir, githubURL string) *Store {
	return &Store{dir: dir, githubURL: strings.TrimRight(githubURL, "/"), http: &http.Client{Timeout: 5 * time.Minute}, loading: map[string]*sync.Mutex{}}
}

var (
	repoPattern = regexp.MustCompile(`^[\w.-]+/[\w.-]+$`)
	shaPattern  = regexp.MustCompile(`^[0-9a-f]{40}$`)
)

// Load reads a world at a commit, downloading it first if it isn't on disk.
func (s *Store) Load(ctx context.Context, repo, sha string) (*World, error) {
	if !repoPattern.MatchString(repo) || !shaPattern.MatchString(sha) {
		return nil, fmt.Errorf("worlds: bad repo or sha %q@%q", repo, sha)
	}
	path := filepath.Join(s.dir, strings.ReplaceAll(repo, "/", "__"), sha+".zip")
	lock := s.lockFor(path)
	lock.Lock()
	defer lock.Unlock()
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		if err := s.download(ctx, repo, sha, path); err != nil {
			return nil, err
		}
	}
	w, err := Read(path)
	if err != nil {
		return nil, err
	}
	w.Repo, w.Sha = repo, sha
	return w, nil
}

func (s *Store) lockFor(path string) *sync.Mutex {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.loading[path] == nil {
		s.loading[path] = &sync.Mutex{}
	}
	return s.loading[path]
}

// download fetches a commit's zip from GitHub (a released world's repo is public) into path.
func (s *Store) download(ctx context.Context, repo, sha, path string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/repos/%s/zipball/%s", s.githubURL, repo, sha), nil)
	if err != nil {
		return err
	}
	res, err := s.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("worlds: downloading %s@%s: %s", repo, sha, res.Status)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), "download-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := io.Copy(tmp, res.Body); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

// Read reads a world from a zip of its repo. GitHub's zips put everything in one top directory.
func Read(path string) (*World, error) {
	z, err := zip.OpenReader(path)
	if err != nil {
		return nil, err
	}
	defer z.Close()
	files := map[string]*zip.File{}
	prefix := ""
	for _, f := range z.File {
		if top, rest, ok := strings.Cut(f.Name, "/"); ok && rest != "" {
			files[rest] = f
			prefix = top + "/"
		}
	}
	var info struct {
		Version    int                    `json:"version"`
		Continents []struct{ Key string } `json:"continents"`
		Spawn      *Spawn                 `json:"spawn"`
		Dummies    []Dummy                `json:"dummies"`
		RestPoints []RestPoint            `json:"restPoints"`
	}
	if err := readJSON(files, "world.json", &info); err != nil {
		return nil, err
	}
	if info.Version != 2 {
		return nil, fmt.Errorf("worlds: %s is a version %d world, not 2", path, info.Version)
	}
	w := &World{path: path, prefix: prefix}
	for _, c := range info.Continents {
		w.Continents = append(w.Continents, c.Key)
	}
	if info.Spawn == nil || !slices.Contains(w.Continents, info.Spawn.Continent) {
		return nil, fmt.Errorf("worlds: %s has no spawn point on one of its continents: set one in /create", path)
	}
	w.Spawn = *info.Spawn
	w.Dummies = info.Dummies
	w.RestPoints = info.RestPoints
	w.Classes = readClasses(files)
	return w, nil
}

// SpawnAt is the spawn point in continent feet [x, y, z]; y is 0 until the server knows the ground.
func (w *World) SpawnAt() [3]float64 {
	return [3]float64{w.Spawn.At[0], 0, w.Spawn.At[1]}
}

// TileOf is the tile holding continent feet (x, z).
func TileOf(x, z float64) [2]int {
	return [2]int{int(math.Floor(x / TileFt)), int(math.Floor(z / TileFt))}
}

// readClasses reads classes/<id>.json, in order of id, leaving out any it can't read.
func readClasses(files map[string]*zip.File) []*combat.Class {
	var paths []string
	for name := range files {
		if dir, file := filepath.Split(name); dir == "classes/" && strings.HasSuffix(file, ".json") {
			paths = append(paths, name)
		}
	}
	slices.Sort(paths)
	classes := []*combat.Class{}
	for _, path := range paths {
		c := &combat.Class{}
		// One bad class shouldn't keep everyone out of the world.
		if err := readJSON(files, path, c); err != nil {
			log.Printf("worlds: skipping a class: %v", err)
			continue
		}
		c.WithHomeward()
		classes = append(classes, c)
	}
	return classes
}

func readJSON(files map[string]*zip.File, path string, out any) error {
	f := files[path]
	if f == nil {
		return fmt.Errorf("worlds: no %s", path)
	}
	r, err := f.Open()
	if err != nil {
		return err
	}
	defer r.Close()
	if err := json.NewDecoder(r).Decode(out); err != nil {
		return fmt.Errorf("worlds: %s: %w", path, err)
	}
	return nil
}
