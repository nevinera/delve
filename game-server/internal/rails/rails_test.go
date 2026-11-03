package rails

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCharacter(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/worlds/3/characters/12" || r.Header.Get("X-Internal-Token") != "tok" {
			http.Error(w, "no", http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(`{"id":12,"name":"Arwen","look":{"skin":3},"position":null}`))
	}))
	defer srv.Close()

	got, err := New(srv.URL+"/", "tok").Character(context.Background(), 3, 12)
	if err != nil || got.Name != "Arwen" || string(got.Look) != `{"skin":3}` || got.Position != nil {
		t.Fatalf("Character = %+v, %v", got, err)
	}
	if _, err := New(srv.URL, "wrong").Character(context.Background(), 3, 12); err == nil {
		t.Error("Character with the wrong token didn't fail")
	}
}

func TestSavePosition(t *testing.T) {
	var got string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut || r.URL.Path != "/internal/worlds/3/characters/12/position" || r.Header.Get("Content-Type") != "application/json" {
			http.Error(w, "no", http.StatusNotFound)
			return
		}
		b, _ := io.ReadAll(r.Body)
		got = string(b)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	err := New(srv.URL, "tok").SavePosition(context.Background(), 3, 12, Position{Continent: "main", At: [3]float64{1, 2, 3}, Yaw: 0.5})
	if err != nil || got != `{"continent":"main","at":[1,2,3],"yaw":0.5}` {
		t.Fatalf("SavePosition sent %s, %v", got, err)
	}
}

func TestSaveClass(t *testing.T) {
	var path, got string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		path, got = r.Method+" "+r.URL.Path, string(body)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	if err := New(srv.URL, "tok").SaveClass(context.Background(), 3, 12, "frst0001"); err != nil {
		t.Fatal(err)
	}
	if path != "PUT /internal/worlds/3/characters/12/class" || got != `{"class":"frst0001"}` {
		t.Fatalf("SaveClass sent %s %s", path, got)
	}
}
