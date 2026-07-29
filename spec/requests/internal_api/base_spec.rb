require "rails_helper"

RSpec.describe "InternalApi token authentication", type: :request do
  let(:tokens) { "token-a,token-b" }

  before do
    allow(ENV).to receive(:fetch).and_call_original
    allow(ENV).to receive(:fetch).with("INTERNAL_API_TOKENS", "").and_return(tokens)

    stub_const("InternalApi::ProbeController", Class.new(InternalApi::BaseController) do
      def index
        render json: {ok: true}
      end
    end)

    Rails.application.routes.draw do
      namespace :internal_api do
        get "probe", to: "probe#index"
      end
    end
  end

  after { Rails.application.reload_routes! }

  def get_probe(token: nil)
    headers = token ? {"X-Internal-Token" => token} : {}
    get "/internal_api/probe", headers: headers
  end

  it "allows requests with a valid first token" do
    get_probe(token: "token-a")
    expect(response).to have_http_status(:ok)
  end

  it "allows requests with a valid second token" do
    get_probe(token: "token-b")
    expect(response).to have_http_status(:ok)
  end

  it "rejects requests with an invalid token" do
    get_probe(token: "bad-token")
    expect(response).to have_http_status(:unauthorized)
    expect(response.parsed_body["error"]).to eq("unauthorized")
  end

  it "rejects requests with no token" do
    get_probe
    expect(response).to have_http_status(:unauthorized)
  end

  context "when INTERNAL_API_TOKENS is blank" do
    let(:tokens) { "" }

    it "rejects all requests" do
      get_probe(token: "anything")
      expect(response).to have_http_status(:unauthorized)
    end
  end

  context "when tokens have surrounding whitespace" do
    let(:tokens) { " token-a , token-b " }

    it "still accepts a matching token" do
      get_probe(token: "token-a")
      expect(response).to have_http_status(:ok)
    end
  end
end
