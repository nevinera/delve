require "rails_helper"

RSpec.describe "Build::CharacterClasses", type: :request do
  let(:user) { create(:user) }
  let(:character_class) { create(:character_class, user:, content_sha: "stale") }
  let(:content) { File.read(Rails.root.join("spec/fixtures/classes/puncher.full.json")) }

  before { sign_in user }

  def refetch(from: "/play/characters")
    post "/build/character_classes/#{character_class.id}/refetch", headers: {"HTTP_REFERER" => from}
  end

  it "re-reads the class file, updating its checksum, and goes back" do
    stub_request(:get, character_class.location).to_return(body: content)
    refetch(from: "/play/characters/1")
    expect(character_class.reload.content_sha).to eq(Digest::SHA1.hexdigest(content))
    expect(response).to redirect_to("/play/characters/1")
    expect(flash[:notice]).to include("refetched")
  end

  it "reports a class file that no longer validates" do
    stub_request(:get, character_class.location).to_return(body: {name: "Puncher"}.to_json)
    refetch
    expect(flash[:alert]).to include("refetched, but it's invalid")
  end

  it "reports a class file that can't be fetched" do
    stub_request(:get, character_class.location).to_return(status: 404)
    refetch
    expect(flash[:alert]).to include("Couldn't refetch")
  end

  it "refuses another user's class" do
    other = create(:character_class)
    expect { post "/build/character_classes/#{other.id}/refetch" }.to raise_error(CanCan::AccessDenied)
  end
end
