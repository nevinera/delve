# frozen_string_literal: true

require "json"
require "openssl"
require "socket"
require "uri"
require "websocket/driver"

module Bot
  # A websocket to one game-server slot (ws:// or wss://). Messages go up
  # as JSON with "direction": "up" and a per-connection hex seq (as
  # client/src/game/connection.js sends them); messages coming down are
  # parsed and returned from #read.
  class Connection
    attr_reader :close_reason

    def initialize(url, log:)
      @url = url
      @log = log
      @seq = 0
      @inbox = []
      @state = :connecting
      @socket = open_socket(URI.parse(url))
      @driver = build_driver
      @driver.start
    end

    # For WebSocket::Driver, which reads the URL and writes through this.
    attr_reader :url

    def write(data)
      @socket.write(data)
    rescue IOError, SystemCallError => e
      closed("write failed: #{e.message}")
    end

    def open? = @state == :open

    def closed? = @state == :closed

    def send_message(msg)
      return unless open?
      @seq += 1
      @driver.text(JSON.generate(msg.merge(direction: "up", seq: @seq.to_s(16))))
    end

    # Waits up to `timeout` seconds for data, and returns the messages that
    # arrived (maybe none).
    def read(timeout)
      return [] if closed?
      pump if buffered? || IO.select([@socket], nil, nil, timeout)
      @inbox.shift(@inbox.size)
    end

    # Starts a clean close, then waits up to `wait` seconds for the server
    # to answer it (or until `stop_waiting` says not to).
    def close(wait: 2, stop_waiting: -> { false })
      return if closed?
      @driver.close
      deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + wait
      read(0.05) until closed? || stop_waiting.call || Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
    ensure
      @socket.close unless @socket.closed?
      @state = :closed
    end

    private

    def build_driver
      WebSocket::Driver.client(self).tap do |driver|
        driver.on(:open) { @state = :open }
        driver.on(:message) { |event| receive(event.data) }
        driver.on(:close) { |event| closed("#{event.code} #{event.reason}".strip) }
        driver.on(:error) { |event| @log.warn("websocket error: #{event.message}") }
      end
    end

    def open_socket(uri)
      tcp = TCPSocket.new(uri.host, uri.port)
      return tcp unless uri.scheme == "wss"
      OpenSSL::SSL::SSLSocket.new(tcp, OpenSSL::SSL::SSLContext.new.tap(&:set_params)).tap do |ssl|
        ssl.hostname = uri.host
        ssl.sync_close = true
        ssl.connect
      end
    end

    # An SSL socket can hold decrypted data IO.select doesn't see.
    def buffered? = @socket.respond_to?(:pending) && @socket.pending.positive?

    # Reads everything the socket has right now into the driver.
    def pump
      loop { @driver.parse(@socket.read_nonblock(65_536)) }
    rescue IO::WaitReadable
      # drained
    rescue IOError, SystemCallError => e # EOFError is an IOError
      closed("connection lost: #{e.class.name.demodulize}")
    end

    def receive(data)
      msg = JSON.parse(data)
      @inbox << msg if msg["direction"] == "down"
    rescue JSON::ParserError
      @log.warn("non-JSON message: #{data[0, 80]}")
    end

    def closed(reason)
      @close_reason ||= reason
      @state = :closed
    end
  end
end
