# frozen_string_literal: true

module Bot
  # Puts a character into a world the way the play page does (EnterWorld),
  # and returns where to connect: the slot's websocket URL on the game
  # server (GAME_SERVER_URL, as Rails reaches it), and the zone joined.
  class Join
    Result = Data.define(:url, :zone, :instance_identifier, :slot_id)

    def self.call(...) = new(...).call

    def initialize(character:, world:)
      @character = character
      @world = world
    end

    def call
      entry = EnterWorld.call(character: @character, world: @world)
      join = entry.join
      Result.new(url: url(join), zone: entry.zone, instance_identifier: join.instance_identifier, slot_id: join.slot_id)
    end

    private

    def url(join)
      base = URI.parse(ENV.fetch("GAME_SERVER_URL", "http://localhost:8090"))
      scheme = (base.scheme == "https") ? "wss" : "ws"
      query = URI.encode_www_form(token: join.token)
      "#{scheme}://#{base.host}:#{base.port}/instances/#{join.instance_identifier}/slots/#{join.slot_id}/connect?#{query}"
    end
  end
end
