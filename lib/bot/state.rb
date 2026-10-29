module Bot
  # What the bot knows: itself, from the server's welcome, and the characters near it, as the
  # server reports them. Characters are hashes as the protocol has them (string keys), positions
  # continent feet [x, y, z].
  class State
    attr_reader :me, :others

    def initialize
      @me = nil
      @others = {} # id -> character
    end

    def entered? = !@me.nil?

    def apply(msg)
      case msg["type"]
      when "welcome" then @me = msg["you"]
      when "snapshot" then msg["characters"].each { |c| @others[c["id"]] = c }
      when "appear" then @others[msg["character"]["id"]] = msg["character"]
      when "vanish" then @others.delete(msg["id"])
      when "moved" then @others[msg["id"]]&.merge!(msg.slice("at", "yaw", "move"))
      end
    end

    # A character near the bot, by name (ignoring case).
    def named(name) = @others.values.find { |c| c["name"].casecmp?(name) }

    # The distance across the ground between two characters, in feet.
    def self.distance(a, b) = Math.hypot(a["at"][0] - b["at"][0], a["at"][2] - b["at"][2])
  end
end
