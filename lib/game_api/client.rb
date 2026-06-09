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

  class Client
    # base_url and auth_tokens default to env vars so callers in production
    # code need no arguments, while tests can pass explicit values without
    # touching the environment.
    def initialize(
      base_url: ENV.fetch("GAME_SERVER_URL", "http://localhost:8090"),
      auth_tokens: ENV.fetch("GAME_SERVER_AUTH_TOKENS", "")
    )
      @base_url = base_url.chomp("/")
      @token = auth_tokens.split(",").map(&:strip).reject(&:empty?).first
    end

    # GET /status.json — public, no auth required.
    def status
      get("/status.json")
    end

    # GET /instances
    def list_instances
      get("/instances")
    end

    # GET /instances/:id
    def show_instance(id)
      get("/instances/#{id}")
    end

    # POST /instances.
    # Required: :identifier, :database_id, :zone_identifier, :version, :source_url, :zone_config
    def create_instance(attrs)
      validate_attrs(attrs, required: %i[identifier database_id zone_identifier version source_url zone_config])
      post("/instances", attrs)
    end

    # DELETE /instances/:id — returns nil on success.
    def destroy_instance(id)
      delete("/instances/#{id}")
      nil
    end

    private

    def validate_attrs(attrs, required: [], supported: [])
      keys = attrs.keys.map(&:to_sym)
      allowed = required + supported
      problems = attr_problems(keys, required, allowed)
      raise InvalidAttrsError, problems.join("; ") if problems.any?
    end

    def attr_problems(keys, required, allowed)
      problems = []
      missing = required - keys
      problems << "missing required keys: #{missing.join(", ")}" if missing.any?
      extra = keys - allowed
      problems << "unsupported keys: #{extra.join(", ")}" if extra.any?
      problems
    end

    def get(path)
      request(Net::HTTP::Get, path)
    end

    def post(path, body)
      request(Net::HTTP::Post, path, body: body)
    end

    def delete(path)
      request(Net::HTTP::Delete, path)
    end

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
