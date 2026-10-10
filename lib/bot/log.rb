# frozen_string_literal: true

module Bot
  # Logs to stderr: info and warnings always, verbose (non-state messages)
  # at -v, debug (every state message) at -vv, dimmed on a terminal.
  class Log
    DIM = "\e[90m"
    RESET = "\e[0m"

    def initialize(verbosity: 0, io: $stderr)
      @verbosity = verbosity
      @io = io
      @color = io.tty?
    end

    def info(msg) = @io.puts(msg)

    def warn(msg) = @io.puts("WARN: #{msg}")

    def verbose(msg)
      dim(msg) if @verbosity >= 1
    end

    def debug(msg)
      dim(msg) if @verbosity >= 2
    end

    private

    def dim(msg) = @io.puts(@color ? "#{DIM}#{msg}#{RESET}" : msg)
  end
end
