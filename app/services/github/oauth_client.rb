module Github
  class OauthClient
    TOKEN_URL = "https://github.com/login/oauth/access_token"

    def self.exchange_code(code)
      new.post(grant_type: "authorization_code", code: code)
    end

    def self.refresh(refresh_token)
      new.post(grant_type: "refresh_token", refresh_token: refresh_token)
    end

    def self.revoke(access_token)
      new.delete_grant(access_token)
    end

    def delete_grant(access_token)
      uri = URI("https://api.github.com/applications/#{client_id}/grant")
      request = Net::HTTP::Delete.new(uri)
      request.basic_auth(client_id, client_secret)
      request["Accept"] = "application/vnd.github+json"
      request.body = {access_token: access_token}.to_json
      Net::HTTP.start(uri.host, uri.port, use_ssl: true) { |http| http.request(request) }
    end

    def post(params)
      body = JSON.parse(Net::HTTP.start(uri.host, uri.port, use_ssl: true) { |http| http.request(build_request(params)) }.body)
      raise Github::OauthError, (body["error_description"] || body["error"]) if body["error"]
      body
    end

    private

    def uri
      URI(TOKEN_URL)
    end

    def build_request(params)
      request = Net::HTTP::Post.new(uri)
      request["Accept"] = "application/json"
      request.set_form_data(params.merge(client_id: client_id, client_secret: client_secret))
      request
    end

    def client_id
      ENV.string("DELVE_GITHUB_CLIENT_ID", default: nil)
    end

    def client_secret
      ENV.string("DELVE_GITHUB_CLIENT_SECRET", default: nil)
    end
  end
end
