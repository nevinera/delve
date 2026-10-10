# frozen_string_literal: true

require "rails_helper"

# Hands out the queued messages one read at a time, and records what's
# sent and whether it was closed.
module BotSpec
  class FakeConnection
    attr_reader :sent, :close_reason
    attr_accessor :inbox, :closed_by_server, :on_read

    def initialize(inbox)
      @inbox = inbox
      @sent = []
      @closed = false
    end

    def open? = !@closed

    def closed? = @closed

    def send_message(msg) = @sent << msg

    def read(_timeout)
      on_read&.call
      if @inbox.empty? && closed_by_server
        @closed = true
        @close_reason = "1000 bye"
      end
      @inbox.empty? ? [] : [@inbox.shift]
    end

    def close(**)
      @sent << :close
      @closed = true
    end
  end
end

RSpec.describe Bot::Runner do
  let(:character) { instance_double(Character, name: "Grizzle") }
  let(:world) { instance_double(World) }
  let(:log) { Bot::Log.new(io: StringIO.new) }
  let(:me) do
    {"zone_unit_identifier" => "player:Grizzle", "map_identifier" => "hub", "position" => {"x" => 0, "y" => 0, "angle" => 45},
     "radius" => 2.5, "health" => 1, "max_health" => 1, "resources" => {}, "status" => "alive", "active_status_effects" => []}
  end
  let(:full_state) { {"type" => "instance-state", "units" => {"a" => me}, "checksum" => GameApi::Checksum.compute_checksum({"a" => me})} }

  before do
    zone = instance_double(Zone, identifier: "forest")
    allow(Bot::Join).to receive(:call).and_return(Bot::Join::Result.new(url: "ws://x", zone:, zone_data: {}, instance_identifier: "i", slot_id: "s"))
    allow(LeaveWorld).to receive(:call)
  end

  def runner(strategy, connection)
    described_class.new(character:, world:, strategy:, log:, connect: ->(_url) { connection })
  end

  it "ticks the strategy once loaded, then stops, closes, and leaves the world when it quits" do
    connection = BotSpec::FakeConnection.new([full_state])
    strategy = Bot::Strategies::Script.new({"steps" => [{"do" => "move", "keys" => ["forward"]}, {"after" => 0.15, "do" => "quit"}]})

    runner(strategy, connection).run

    moves = connection.sent.select { |m| m.is_a?(Hash) && m[:type] == "move" }
    expect(moves).to eq([{type: "move", facing: 45.0, keys: ["forward"]}, {type: "move", facing: 45.0, keys: []}])
    expect(connection.sent.last).to eq(:close)
    expect(connection.sent).to include({type: "heartbeat"})
    expect(LeaveWorld).to have_received(:call).with(character:, world:)
  end

  it "shuts down cleanly when interrupted" do
    connection = BotSpec::FakeConnection.new([full_state])
    bot = runner(Bot::Strategies::Null.new, connection)
    reads = 0
    connection.on_read = -> { bot.interrupt! if (reads += 1) == 3 }

    bot.run

    expect(connection.sent.last).to eq(:close)
    expect(LeaveWorld).to have_received(:call)
  end

  it "asks for a full state after a checksum mismatch" do
    connection = BotSpec::FakeConnection.new([full_state, {"type" => "delta", "checksum" => "wrong"}])
    connection.closed_by_server = true

    runner(Bot::Strategies::Null.new, connection).run

    expect(connection.sent).to include({type: "full-state-request"})
    expect(connection.sent).not_to include(:close)
    expect(LeaveWorld).to have_received(:call)
  end

  it "hands other messages to the strategy" do
    connection = BotSpec::FakeConnection.new([full_state, {"type" => "quest-offers", "offers" => {}}])
    connection.closed_by_server = true
    strategy = Bot::Strategies::Null.new
    allow(strategy).to receive(:on_message)

    runner(strategy, connection).run

    expect(strategy).to have_received(:on_message).with({"type" => "quest-offers", "offers" => {}})
  end
end
