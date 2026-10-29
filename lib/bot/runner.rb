module Bot
  # Runs one bot: enters the game server with a token as the play page does, keeps the State,
  # ticks the strategy, and reports its movement, until the strategy quits, the server closes the
  # socket, or the process is told to stop (SIGINT/SIGTERM). Then it stops moving and closes the
  # socket, and the server saves where it was. A second signal skips waiting for the close.
  class Runner
    TICK = 0.1

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

    # Where the bot connects: the game server, as browsers reach it, with an entry token.
    def url
      token = Game::EntryToken.issue(character: @character, world: @world)
      "#{Game::EntryToken.server_url}/play?token=#{CGI.escape(token)}"
    end

    def run
      @connection = @connect.call(url)
      @state = State.new
      @controls = Controls.new(method(:send_message))
      loop_until_done
    ensure
      shut_down
    end

    private

    def send_message(msg)
      @log.verbose("[#{msg[:type]}] #{msg.except(:type).to_json}")
      @connection.send_message(msg)
    end

    def loop_until_done
      @last_tick = nil
      until done?
        @connection.read(TICK / 2).each { |msg| handle(msg) }
        now = clock
        tick(now) if @state.entered? && (@last_tick.nil? || now - @last_tick >= TICK)
      end
    end

    def tick(now)
      dt = @last_tick ? now - @last_tick : 0
      @strategy.tick(@state, @controls, now)
      @controls.advance(dt)
      @controls.report(now)
      @last_tick = now
    end

    def handle(msg)
      if msg["type"] == "moved"
        @log.debug("[moved] #{msg.except("type").to_json}")
      else
        @log.verbose("[#{msg["type"]}] #{msg.except("type").to_json}")
      end
      @log.warn("server: #{msg["message"]}") if msg["type"] == "error"
      @state.apply(msg)
      entered if msg["type"] == "welcome"
      @log.info("#{msg["character"]["name"]} came near") if msg["type"] == "appear"
    end

    def entered
      @controls.adopt(@state.me)
      x, y, z = @state.me["at"]
      @log.info(format("Entered %s as %s, on %s at (%.0f, %.0f, %.0f)", @world.display_name, @character.name, @state.me["continent"], x, y, z))
    end

    def done?
      return true if @signals.positive?
      return quitting if @controls.quit?
      return false unless @connection.closed?
      @log.info("The server closed the connection: #{@connection.close_reason}")
      true
    end

    def quitting
      @log.info("The strategy quit#{": #{@controls.quit_reason}" if @controls.quit_reason}.")
      true
    end

    def shut_down
      return unless @connection && !@connection.closed?
      @log.info("Leaving...")
      if @state.entered?
        @controls.stop
        @controls.report(clock)
      end
      @connection.close(stop_waiting: -> { @signals > 1 })
      @log.info("Left.")
    end

    def clock = Process.clock_gettime(Process::CLOCK_MONOTONIC)
  end
end
