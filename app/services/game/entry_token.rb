# The signed, short-lived token a player's browser enters the game server with
# (docs/formats/game-protocol.md, "Entry tokens"). The game server checks it with the same secret.
module Game
  class EntryToken
    LIFETIME = 5.minutes
    # Rails and the game server's shared secret; local runs get a fixed one.
    LOCAL_SECRET = "local-game-token-secret"

    def self.issue(character:, world:, now: Time.current)
      payload = {user: character.user_id, character: character.id, world: world.id, repo: world.repo, sha: world.released_sha, exp: (now + LIFETIME).to_i}
      body = Base64.urlsafe_encode64(payload.to_json, padding: false)
      "#{body}.#{Base64.urlsafe_encode64(OpenSSL::HMAC.digest("SHA256", secret, body), padding: false)}"
    end

    def self.secret
      ENV.string("GAME_TOKEN_SECRET", default: nil).presence || (Rails.env.local? ? LOCAL_SECRET : raise(KeyError, "GAME_TOKEN_SECRET isn't set"))
    end

    # Where browsers reach the game server, as a websocket URL.
    def self.server_url
      ENV.string("GAME_SERVER_PUBLIC_URL", default: "http://localhost:8090").sub(/\Ahttp/, "ws").chomp("/")
    end
  end
end
