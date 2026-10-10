# frozen_string_literal: true

module Bot
  # Runs one bot: joins the world, connects, keeps the game state, sends
  # heartbeats, and ticks the strategy until it quits, the server closes
  # the socket, or the process is told to stop (SIGINT/SIGTERM). Then it
  # always shuts down cleanly: a stop move, a websocket close, and
  # LeaveWorld so the slot frees at once. A second signal skips waiting
  # for the server's close.
  class Runner
    TICK = 0.1
    HEARTBEAT = 0.3 # as the browser client (client/src/game/connection.js)

    def initialize(character:, world:, strategy:, log:, connect: ->(url) { Connection.new(url, log:) })
      @character = character
      @world = world
      @strategy = strategy
      @log = log
      @connect = connect
      @signals = 0
    end

    # Called from a signal trap; does nothing but count.
    def interrupt!
      @signals += 1
    end

    def run
      join = Join.call(character: @character, world: @world)
      @joined = true
      @log.info("Joined #{join.zone.identifier} (instance #{join.instance_identifier}, slot #{join.slot_id})")
      connect(join)
      loop_until_done
    ensure
      shut_down
    end

    private

    def connect(join)
      @connection = @connect.call(join.url)
      @state = GameState.new(character_name: @character.name, zone_data: join.zone_data)
      @controls = Controls.new(method(:send_move))
    end

    def send_move(msg)
      if msg[:type] == "move"
        @log.verbose("[move] facing #{msg[:facing].round(1)}, keys #{msg[:keys].inspect} at #{where(@state.me)}")
      else
        @log.verbose("[#{msg[:type]}] #{msg.except(:type).to_json}")
      end
      @connection.send_message(msg)
    end

    def loop_until_done
      @last_heartbeat = @last_tick = -Float::INFINITY
      until done?
        @connection.read(TICK / 2).each { |msg| handle(msg) }
        now = clock
        heartbeat(now)
        tick(now)
      end
    end

    def heartbeat(now)
      return unless @connection.open? && now - @last_heartbeat >= HEARTBEAT
      @connection.send_message({type: "heartbeat"})
      @last_heartbeat = now
    end

    def tick(now)
      return unless @state.loaded? && now - @last_tick >= TICK
      @strategy.tick(@state, @controls, now)
      @controls.steer(@state.me, lookahead: TICK)
      @controls.flush
      @last_tick = now
    end

    def done?
      return true if @signals.positive?
      return quitting if @controls.quit?
      return false unless @connection.closed?
      @log.info("Server closed the connection: #{@connection.close_reason}")
      true
    end

    def quitting
      @log.info("The strategy quit#{": #{@controls.quit_reason}" if @controls.quit_reason}.")
      true
    end

    def handle(msg)
      case msg["type"]
      when "instance-state", "delta"
        apply_state(msg)
        @log.debug("[#{msg["type"]}] #{msg.except("type", "direction").to_json}")
      else
        @log.verbose("[#{msg["type"]}] #{msg.except("type", "direction").to_json}")
        @strategy.on_message(msg)
      end
    end

    def apply_state(msg)
      first = !@state.loaded?
      unless @state.apply(msg)
        @log.warn("checksum mismatch after #{msg["type"]}; asking for a full state")
        @connection.send_message({type: "full-state-request"})
      end
      loaded if first && @state.loaded?
    end

    def loaded
      @controls.adopt(@state.me)
      @log.info("In the game at #{where(@state.me)}: #{@state.units.size} units visible.")
    end

    def where(unit)
      pos = unit&.dig("position") or return "nowhere"
      format("%s (%.1f, %.1f) facing %.0f", unit["map_identifier"], pos["x"], pos["y"], pos["angle"])
    end

    def shut_down
      return unless @joined
      @log.info("Shutting down...")
      if @connection && !@connection.closed?
        @controls.stop
        @controls.flush
        @connection.close(stop_waiting: -> { @signals > 1 })
      end
      LeaveWorld.call(character: @character, world: @world)
      @log.info("Left the world.")
    rescue GameApi::Error => e
      @log.warn("couldn't free the slot: #{e.message}")
    end

    def clock = Process.clock_gettime(Process::CLOCK_MONOTONIC)
  end
end
