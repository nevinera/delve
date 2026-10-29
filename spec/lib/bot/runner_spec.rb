require "rails_helper"

RSpec.describe Bot::Runner do
  # A connection the test scripts: each read gives the next batch of messages, and it closes after
  # the last.
  let(:fake) do
    Class.new do
      attr_reader :sent, :url

      def initialize(url, batches)
        @url = url
        @batches = batches
        @sent = []
        @closed = false
      end

      def read(_timeout)
        sleep 0.11
        return @batches.shift || [] unless @batches.empty?
        @closed = true
        []
      end

      def send_message(msg) = @sent << msg
      def open? = !@closed
      def closed? = @closed
      def close_reason = "done"
      def close(**) = @closed = true
    end
  end

  let(:world) { create(:world, name: "Vale", released_sha: "c" * 40) }
  let(:character) { create(:character, name: "Botty") }
  let(:log) { Bot::Log.new(io: StringIO.new) }
  let(:welcome) { {"type" => "welcome", "you" => {"id" => character.id, "name" => "Botty", "continent" => "main", "at" => [0, 5, 0], "yaw" => 0}} }
  let(:arwen) { {"id" => 99, "name" => "Arwen", "continent" => "main", "at" => [30, 7, 0], "yaw" => 0, "move" => {}} }

  def run_bot(strategy, batches)
    connection = nil
    runner = described_class.new(character:, world:, strategy:, log:, connect: ->(url) { connection = fake.new(url, batches) })
    runner.run
    connection
  end

  it "enters with a token for its character and world" do
    connection = run_bot(Bot::Strategies::Null.new, [[welcome]])
    token = CGI.unescape(connection.url[/token=(.*)/, 1])
    expect(JSON.parse(Base64.urlsafe_decode64(token.split(".").first))).to include("character" => character.id, "world" => world.id)
    expect(connection.sent.first).to include(type: "move", at: [0.0, 5.0, 0.0])
  end

  it "follows a character it's told to" do
    strategy = Bot::Strategies::Follow.new("target" => "arwen", "stop_feet" => 5)
    connection = run_bot(strategy, [[welcome, {"type" => "snapshot", "characters" => [arwen]}], [], [], [], []])
    moves = connection.sent.select { |m| m[:type] == "move" }
    expect(moves.first[:move][:forward]).to eq(1)
    expect(moves.first[:yaw]).to be_within(0.01).of(Math::PI / 2)
    expect(connection.sent.last[:at][0]).to be > 5
    expect(connection.sent.last[:at][1]).to eq(7.0)
  end

  it "won't follow without a target" do
    expect { Bot::Strategies::Follow.new({}) }.to raise_error(Bot::Strategy::ConfigError)
    expect { Bot::Strategies.build("dance", {}) }.to raise_error(Bot::Strategy::ConfigError, /unknown strategy/)
  end
end
