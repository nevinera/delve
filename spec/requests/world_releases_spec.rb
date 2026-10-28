require "rails_helper"

RSpec.describe "Releasing a world", type: :request do
  let(:user) { create(:user) }
  let(:world) { create(:world, user:, repo: "me/thorn") }
  let(:import) { create(:world_import, world:, tag: "v4", sha: "f" * 40, status: "passed", private_repo: false) }

  def stub_repo(body, status: 200)
    stub_request(:get, "https://api.github.com/repos/me/thorn").to_return(status:, headers: {"Content-Type" => "application/json"}, body: body.to_json)
  end

  before do
    sign_in user
    create(:github_connection, user:)
  end

  it "points released_sha at the import's commit" do
    stub_repo({full_name: "me/thorn", private: false})
    post world_release_path(world), params: {import_id: import.id}
    expect(response).to redirect_to(world_path(world))
    expect(world.reload).to have_attributes(released_sha: "f" * 40, released_tag: "v4", released_at: be_present)
    stub_request(:get, "https://api.github.com/repos/me/thorn/git/matching-refs/tags/").to_return(headers: {"Content-Type" => "application/json"}, body: [].to_json)
    follow_redirect!
    expect(response.body).to include("Released v4")
  end

  it "refuses a repo that's private now" do
    stub_repo({full_name: "me/thorn", private: true})
    post world_release_path(world), params: {import_id: import.id}
    expect(world.reload.released_sha).to be_nil
    expect(flash[:alert]).to include("is private")
  end

  it "refuses an import that didn't pass" do
    import.update!(status: "failed")
    post world_release_path(world), params: {import_id: import.id}
    expect(world.reload.released_sha).to be_nil
    expect(flash[:alert]).to include("passed")
  end

  it "won't release another world's import" do
    other = create(:world_import, world: create(:world, user:), status: "passed", sha: "e" * 40)
    post world_release_path(world), params: {import_id: other.id}
    expect(response).to have_http_status(:not_found)
  end
end
