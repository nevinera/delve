require "rails_helper"

RSpec.describe ImportWorldJob do
  let(:owner) { create(:user) }
  let(:world) { create(:world, user: owner, repo: "me/thorn") }
  let(:import) { create(:world_import, world:, tag: "v2") }
  let(:sha) { "a" * 40 }
  let(:zip) { "PK fake zip bytes" }

  def stub_github(path, body, status: 200, headers: {"Content-Type" => "application/json"})
    stub_request(:get, "https://api.github.com#{path}").to_return(status:, headers:, body: body.is_a?(String) ? body : body.to_json)
  end

  before do
    create(:github_connection, user: owner)
    stub_github("/repos/me/thorn", {full_name: "me/thorn", private: false})
    stub_github("/repos/me/thorn/git/ref/tags/v2", {ref: "refs/tags/v2", object: {sha: "t" * 40, type: "tag"}})
    stub_github("/repos/me/thorn/git/tags/#{"t" * 40}", {object: {sha:, type: "commit"}})
    stub_github("/repos/me/thorn/zipball/#{sha}", "", status: 302, headers: {"Location" => "https://codeload.github.com/me/thorn/legacy.zip/#{sha}"})
    stub_request(:get, "https://codeload.github.com/me/thorn/legacy.zip/#{sha}").to_return(body: zip)
  end

  it "imports the commit the tag points at, by sha, and records its files" do
    expect(Worlds::Manifest).to receive(:call) do |path|
      expect(File.binread(path)).to eq(zip)
      {"world.json" => {"sha" => "s", "size" => 10}, "b" => {"sha" => "t", "size" => 5}}
    end
    described_class.perform_now(import)
    expect(import.reload).to have_attributes(status: "passed", sha:, private_repo: false, file_count: 2, bytes: 15, problems: [], error: nil)
    expect(import.finished_at).to be_present
  end

  it "records an error for a tag that isn't there" do
    stub_github("/repos/me/thorn/git/ref/tags/v2", {message: "Not Found"}, status: 404)
    described_class.perform_now(import)
    expect(import.reload).to have_attributes(status: "error", error: "me/thorn has no tag v2", sha: nil)
  end

  it "records an error when the owner hasn't connected GitHub" do
    owner.github_connection.destroy!
    described_class.perform_now(import.reload)
    expect(import.reload).to have_attributes(status: "error", error: /hasn't connected GitHub/)
  end
end
