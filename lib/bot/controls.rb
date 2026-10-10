# frozen_string_literal: true

module Bot
  # The only way a strategy acts. Calls set what the bot wants (a facing,
  # the movement keys held, or a point to walk to, and who it's attacking)
  # or queue a one-off command (a swing, a respawn); the runner steers and
  # flushes them after each tick, sending a move only when something
  # changed. Facing is in degrees, clockwise from north, and x is east, y
  # north (as the server has them).
  class Controls
    KEYS = %w[forward backward strafe_left strafe_right].freeze

    # The point move_toward is walking to ({x:, y:, stop_within:}), or nil
    # once there (or after any other movement call).
    attr_reader :facing, :keys, :goal
    # The unit id the bot is attacking, or nil.
    attr_reader :attacking

    def initialize(send_message)
      @send_message = send_message
      @facing = 0.0
      @keys = []
      @sent = nil
      @commands = []
      @quit = false
    end

    # Takes the bot's current facing, so the first move doesn't snap it to
    # north.
    def adopt(unit)
      angle = unit&.dig("position", "angle") or return
      @facing = angle.to_f % 360
      @sent = [@facing, @keys]
    end

    def face(degrees)
      @goal = nil
      @facing = degrees.to_f % 360
    end

    # Turns by `degrees`: positive is right (clockwise), negative left.
    def turn(degrees)
      face(@facing + degrees.to_f)
    end

    def move(*keys)
      keys = keys.flatten.map(&:to_s)
      unknown = keys - KEYS
      raise ArgumentError, "unknown movement keys: #{unknown.join(", ")}" if unknown.any?
      @goal = nil
      @keys = keys.uniq
    end

    # Walks straight to (x, y) on the bot's map, stopping within
    # `stop_within` feet of it. No pathing: walls stop it.
    def move_toward(x, y, stop_within = 0)
      @goal = {x: Float(x), y: Float(y), stop_within: Float(stop_within)}
    end

    # Points the bot at its goal and walks, or stops once it's within
    # stop_within, or within a step (its speed over `lookahead` seconds),
    # since getting any nearer would overshoot.
    def steer(unit, lookahead:)
      return unless @goal && (pos = unit&.dig("position"))
      dx, dy = offset_to_goal(pos)
      return stop if Math.hypot(dx, dy) <= arrival_distance(unit, lookahead)
      @facing = (Math.atan2(dx, dy) * 180 / Math::PI) % 360
      @keys = ["forward"]
    end

    def stop = move

    def send_move
      @send_message.call({type: "move", facing: @facing, keys: @keys})
      @sent = [@facing, @keys]
    end

    def offset_to_goal(pos) = [@goal[:x] - pos["x"], @goal[:y] - pos["y"]]

    def arrival_distance(unit, lookahead) = [@goal[:stop_within], unit["speed"].to_f * lookahead].max

    # Targets the unit (by its id in the game state) and starts attacking
    # it. Swings are basic_attack calls.
    def attack(unit_id)
      return if @attacking == unit_id
      @commands << {type: "target", target_id: unit_id} << {type: "start_attacking"}
      @attacking = unit_id
    end

    def stop_attacking
      return unless @attacking
      @commands << {type: "stop_attacking"} << {type: "target", target_id: nil}
      @attacking = nil
    end

    def basic_attack = @commands << {type: "basic_attack"}

    def respawn = @commands << {type: "respawn"}

    # Ends the run, saying why when there's a reason worth logging.
    def quit(reason = nil)
      @quit = true
      @quit_reason = reason
    end

    attr_reader :quit_reason

    def quit? = @quit

    def flush
      send_move unless @sent == [@facing, @keys]
      @commands.each { |command| @send_message.call(command) }
      @commands.clear
    end
  end
end
