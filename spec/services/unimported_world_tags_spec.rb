require "rails_helper"

RSpec.describe UnimportedWorldTags do
  subject(:tags) { described_class.call(world:, user:) }

  let(:user) { create(:user) }
  let(:world) { create(:world, owner: user, repo: "builder/content", path: "worlds/demo.json") }
  let(:refs_url) { "https://api.github.com/repos/builder/content/git/matching-refs/tags/demo/" }

  def stub_tags(*names)
    stub_request(:get, refs_url).to_return(
      headers: {"Content-Type" => "application/json"},
      body: names.map { |name| {ref: "refs/tags/#{name}"} }.to_json
    )
  end

  before { create(:github_installation, user:, repo_full_name: "builder/content") }

  it "lists the world's tags with no version here" do
    create(:world_version, world:, ref: "demo/v2")
    stub_tags("demo/v1", "demo/v2", "demo/v9")
    expect(tags).to eq(["demo/v1", "demo/v9"])
  end

  it "is nil when the GitHub connection points at another repo" do
    world.update!(repo: "someone/else")
    expect(tags).to be_nil
  end

  it "is nil when GitHub can't be read" do
    stub_request(:get, refs_url).to_return(status: 500)
    expect(tags).to be_nil
  end

  it "is nil without a GitHub connection" do
    user.github_installation.destroy!
    expect(described_class.call(world:, user: user.reload)).to be_nil
  end
end
