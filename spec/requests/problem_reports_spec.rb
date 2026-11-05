require "rails_helper"

RSpec.describe "Problem reports", type: :request do
  let(:user) { create(:user) }
  let(:admin) { create(:user, role: "system_admin") }
  let(:dir) { Rails.root.join("tmp/test-problem-reports") }
  let(:voice) { Rack::Test::UploadedFile.new(StringIO.new("OggS voice"), "audio/ogg", original_filename: "voice") }
  let(:screen) { Rack::Test::UploadedFile.new(StringIO.new("\xFF\xD8 jpeg".b), "image/jpeg", original_filename: "screenshot.jpg") }

  before { allow(ProblemReport).to receive(:dir).and_return(dir) }
  after { FileUtils.rm_rf(dir) }

  it "needs you signed in to report" do
    post problem_reports_path, params: {kind: "bug", note: "hi"}
    expect(response).to have_http_status(:unauthorized).or redirect_to(new_user_session_path)
    expect(ProblemReport.count).to eq(0)
  end

  it "keeps a report with its voice note and screenshot" do
    sign_in user
    post problem_reports_path, params: {kind: "object", note: "a big tree", page: "/create", details: {camera: [1, 2, 3]}.to_json, voice: voice, screenshot: screen}

    expect(response).to have_http_status(:created)
    report = ProblemReport.last
    expect([report.kind, report.note, report.user, report.details["camera"], report.voice_type, report.screenshot]).to eq(["object", "a big tree", user, [1, 2, 3], "audio/ogg", true])
    expect(report.voice_path.read).to eq("OggS voice")
    expect(report.screenshot_path).to exist
  end

  it "keeps a voice note sent with no note typed" do
    sign_in user
    firefox_voice = Rack::Test::UploadedFile.new(StringIO.new("OggS voice"), "audio/ogg; codecs=opus", original_filename: "voice")
    post problem_reports_path, params: {kind: "bug", note: "", voice: firefox_voice}

    expect(response).to have_http_status(:created)
    report = ProblemReport.last
    expect([report.note, report.voice_type]).to eq([nil, "audio/ogg"])
    expect(report.voice_path.read).to eq("OggS voice")
  end

  it "won't take a kind it doesn't know, or details that aren't JSON" do
    sign_in user
    post problem_reports_path, params: {kind: "nonsense"}
    expect(response).to have_http_status(:unprocessable_content)
    post problem_reports_path, params: {kind: "how", details: "not json"}
    expect(ProblemReport.last.details).to eq({})
  end

  it "shows reports and their files only to system admins, who mark them done" do
    sign_in user
    post problem_reports_path, params: {kind: "bug", note: "no ground", voice: voice, screenshot: screen}
    report = ProblemReport.last
    get problem_reports_path
    expect(response).to have_http_status(:not_found)
    get voice_problem_report_path(report)
    expect(response).to have_http_status(:not_found)

    sign_in admin
    get problem_reports_path
    expect(response.body).to include("Something&#39;s broken", "no ground", voice_problem_report_path(report))
    get voice_problem_report_path(report)
    expect([response.media_type, response.body]).to eq(["audio/ogg", "OggS voice"])
    get screenshot_problem_report_path(report)
    expect(response.media_type).to eq("image/jpeg")

    patch problem_report_path(report)
    expect(report.reload.done_at).to be_present
    expect(report.files_dir).not_to exist
    get voice_problem_report_path(report)
    expect(response).to have_http_status(:not_found)
  end
end
