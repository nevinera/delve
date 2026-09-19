module GameServerHelper
  # The game server address the browser connects to. Falls back to the
  # server-side URL when no separate public one is configured.
  def game_server_public_url
    ENV.fetch("GAME_SERVER_PUBLIC_URL") { ENV.fetch("GAME_SERVER_URL", "http://localhost:8090") }
  end
end
