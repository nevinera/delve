package rails

import (
	"context"
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
