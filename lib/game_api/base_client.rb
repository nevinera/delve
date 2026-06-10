# frozen_string_literal: true

require "net/http"
require "json"
require "uri"

module GameApi
  class Error < StandardError
    attr_reader :status

    def initialize(message, status: nil)
      super(message)
      @status = status
    end
  end

  class AuthError < Error; end
  class NotFoundError < Error; end
  class UnprocessableError < Error; end
  class InvalidAttrsError < Error; end

  class BaseClient
    def initialize(
      base_url: ENV.string("GAME_SERVER_URL", default: "http://localhost:8090"),
      auth_tokens: ENV.string("GAME_SERVER_AUTH_TOKENS", default: "")
    )
      @base_url = base_url.chomp("/")
      @token = auth_tokens.split(",").map(&:strip).reject(&:empty?).first
    end

    def status
      get("/status.json")
    end

    private

    def validate_attrs(attrs, required: [], supported: [])
      keys = attrs.keys.map(&:to_sym)
      allowed = required + supported
      problems = attr_problems(keys, required: required, allowed: allowed)
      raise InvalidAttrsError, problems.join("; ") if problems.any?
    end

    def attr_problems(keys, required:, allowed:)
      problems = []
      missing = required - keys
      problems << "missing required keys: #{missing.join(", ")}" if missing.any?
      extra = keys - allowed
      problems << "unsupported keys: #{extra.join(", ")}" if extra.any?
      problems
    end

    def get(path) = request(Net::HTTP::Get, path)
    def post(path, body) = request(Net::HTTP::Post, path, body: body)
    def delete(path) = request(Net::HTTP::Delete, path)

    def request(req_class, path, body: nil)
      uri = URI("#{@base_url}#{path}")
      req = req_class.new(uri)
      req["Authorization"] = "Bearer #{@token}" if @token
      if body
        req["Content-Type"] = "application/json"
        req.body = JSON.generate(body)
      end
      res = Net::HTTP.start(uri.host, uri.port) { |http| http.request(req) }
      handle_response(res)
    end

    ERROR_CLASSES = {401 => AuthError, 404 => NotFoundError, 422 => UnprocessableError}.freeze

    def handle_response(res)
      code = res.code.to_i
      return nil if code == 204
      return JSON.parse(res.body) if [200, 201].include?(code)
      raise_for(code, error_message(res))
    end

    def raise_for(code, msg)
      raise ERROR_CLASSES.fetch(code, Error).new(msg, status: code)
    end

    def error_message(res)
      JSON.parse(res.body)["error"] || res.body
    rescue JSON::ParserError
      res.body
    end
  end
end
