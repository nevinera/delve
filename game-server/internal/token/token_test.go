package token

import (
	"errors"
	"testing"
	"time"
)

var now = time.Unix(1_800_000_000, 0)

func claims() Claims {
	return Claims{User: 1, Character: 2, World: 3, Repo: "them/vale", Sha: "abc", Exp: now.Unix() + 300}
}

func TestVerify(t *testing.T) {
	got, err := Verify("shh", Issue("shh", claims()), now)
	if err != nil || got != claims() {
		t.Fatalf("Verify = %+v, %v", got, err)
	}
}

// A token as Rails's Game::EntryToken makes it, for {user: 7, character: 12, world: 3,
// repo: "owner/name", sha: "c"*40, exp: 1800000300}, keyed "shh".
const fromRails = "eyJ1c2VyIjo3LCJjaGFyYWN0ZXIiOjEyLCJ3b3JsZCI6MywicmVwbyI6Im93bmVyL25hbWUiLCJzaGEiOiJjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjIiwiZXhwIjoxODAwMDAwMzAwfQ.trvrUG_2_iyq29QUMsWYEkTB_fXAGiPEuK8Di_QltdM"

func TestVerifyReadsRailsTokens(t *testing.T) {
	got, err := Verify("shh", fromRails, now)
	if err != nil || got.User != 7 || got.Character != 12 || got.World != 3 || got.Repo != "owner/name" || got.Exp != 1800000300 {
		t.Fatalf("Verify = %+v, %v", got, err)
	}
}

func TestVerifyRefuses(t *testing.T) {
	expired := claims()
	expired.Exp = now.Unix()
	for name, c := range map[string]struct {
		raw  string
		want error
	}{
		"another secret": {Issue("other", claims()), ErrSignature},
		"expired":        {Issue("shh", expired), ErrExpired},
		"no signature":   {"abc", ErrMalformed},
		"no character":   {Issue("shh", Claims{World: 3, Repo: "a/b", Sha: "s", Exp: now.Unix() + 1}), ErrMalformed},
	} {
		if _, err := Verify("shh", c.raw, now); !errors.Is(err, c.want) {
			t.Errorf("%s: err = %v, want %v", name, err, c.want)
		}
	}
}
