module Bot
  # How the bot moves, and where that takes it. The bot works out its own position from its
  # movement, as the browser's walker does, and reports it: a move when the movement changes, and
  # heartbeats between (client/src/play/game.js). The server checks the reports add up, and puts the
  # bot back when they don't. Given the ground (Ground), it keeps to it as the walker does: on the
  # ground or slabs, swimming in deep water, not up slopes too steep to walk, and not into slabs.
  # Yaw is radians, 0 facing +z (south); x is east.
  class Controls
    RUN_FT = 21.0
    SWIM_FT = 14.2
    MAX_CLIMB = 1.2 # rise over run
    HEARTBEAT = {moving: 0.5, still: 1.0}

    attr_reader :at, :yaw, :forward
    attr_writer :ground

    def initialize(send_message, ground: nil)
      @send_message = send_message
      @ground = ground
      @forward = 0
      @goal = nil
      @quit = false
      @swimming = false
    end

    # Takes where the server put the bot, on entering or when it corrects the bot, and reports
    # afresh from there.
    def adopt(me)
      @at = me["at"].map(&:to_f)
      @yaw = me["yaw"].to_f
      @sent_move = nil
    end

    # Walks straight to continent feet (x, z), stopping within `stop_within` feet. No pathing: on
    # the ground, a slope too steep to walk stops it. Without the ground, nothing stops it, and it
    # keeps its height unless given one, which it climbs or drops toward no faster than it moves
    # across.
    def move_toward(x, z, stop_within: 0, y: nil)
      @goal = {x: Float(x), z: Float(z), y: y && Float(y), stop_within: Float(stop_within)}
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
      speed = @swimming ? SWIM_FT : RUN_FT
      step = speed * dt * @forward
      if @goal
        dx, dz = @goal[:x] - @at[0], @goal[:z] - @at[2]
        left = Math.hypot(dx, dz) - @goal[:stop_within]
        return stop if left <= 0
        @yaw = Math.atan2(dx, dz)
        @forward = 1
        step = [speed * dt, left].min
        @at[1] += (@goal[:y] - @at[1]).clamp(-step, step) if @goal[:y] && !@ground
      end
      return if step.zero?
      x = @at[0] + Math.sin(@yaw) * step
      z = @at[2] + Math.cos(@yaw) * step
      return step_onto(x, z, step) if @ground
      @at[0], @at[2] = x, z
    end

    # Sends a move when the movement has changed since the last one (or when it's never sent one),
    # and a heartbeat when one's due. now: seconds.
    def report(now)
      move = {forward: @forward, strafe: 0, turn: 0, gait: "run", swim: @swimming, jump: false}
      if move != @sent_move
        @send_message.call({type: "move", t: now * 1000, at: @at, yaw: @yaw, move:})
        @sent_move = move
        @sent_at = now
      elsif now - @sent_at >= HEARTBEAT[@forward.zero? ? :still : :moving]
        @send_message.call({type: "heartbeat", t: now * 1000, at: @at, yaw: @yaw})
        @sent_at = now
      end
    end

    private

    # Steps onto the ground at (x, z), or a slab, unless it's off the land, too steep to climb, or
    # a slab's in the way.
    def step_onto(x, z, step)
      return stop if @ground.enters?(@at, [x, @at[1], z])
      height, swimming = @ground.stand(x, z, @at[1])
      return stop if height.nil?
      return stop if !swimming && !@swimming && height - @at[1] > MAX_CLIMB * step
      @at = [x, height, z]
      @swimming = swimming
    end
  end
end
