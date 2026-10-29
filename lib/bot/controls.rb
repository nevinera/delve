module Bot
  # How the bot moves, and where that takes it. The server checks nothing about movement yet, so
  # the bot works out its own position from its movement, as the browser's walker does, and reports
  # it: a move when the movement changes, and heartbeats between (client/src/play/game.js).
  # Yaw is radians, 0 facing +z (south); x is east.
  class Controls
    RUN_FT = 21.0
    HEARTBEAT = {moving: 0.5, still: 1.0}

    attr_reader :at, :yaw, :forward

    def initialize(send_message)
      @send_message = send_message
      @forward = 0
      @goal = nil
      @quit = false
    end

    # Takes where the server put the bot.
    def adopt(me)
      @at = me["at"].map(&:to_f)
      @yaw = me["yaw"].to_f
    end

    # Walks straight to continent feet (x, z), stopping within `stop_within` feet. No pathing:
    # nothing stops it, and it keeps its height unless given one.
    def move_toward(x, z, stop_within: 0, y: nil)
      @goal = {x: Float(x), z: Float(z), stop_within: Float(stop_within)}
      @at[1] = Float(y) if y
    end

    def stop
      @goal = nil
      @forward = 0
    end

    # Ends the run, saying why when there's a reason worth logging.
    def quit(reason = nil)
      @quit = true
      @quit_reason = reason
    end

    attr_reader :quit_reason

    def quit? = @quit

    # Moves the bot on by dt seconds: toward its goal, if it has one, stopping stop_within feet short
    # of it, or straight on as it's going.
    def advance(dt)
      step = RUN_FT * dt * @forward
      if @goal
        dx, dz = @goal[:x] - @at[0], @goal[:z] - @at[2]
        left = Math.hypot(dx, dz) - @goal[:stop_within]
        return stop if left <= 0
        @yaw = Math.atan2(dx, dz)
        @forward = 1
        step = [RUN_FT * dt, left].min
      end
      @at[0] += Math.sin(@yaw) * step
      @at[2] += Math.cos(@yaw) * step
    end

    # Sends a move when the movement has changed since the last one (or when it's never sent one),
    # and a heartbeat when one's due. now: seconds.
    def report(now)
      move = {forward: @forward, strafe: 0, turn: 0, gait: "run", swim: false, jump: false}
      if move != @sent_move
        @send_message.call({type: "move", at: @at, yaw: @yaw, move:})
        @sent_move = move
        @sent_at = now
      elsif now - @sent_at >= HEARTBEAT[@forward.zero? ? :still : :moving]
        @send_message.call({type: "heartbeat", at: @at, yaw: @yaw})
        @sent_at = now
      end
    end
  end
end
