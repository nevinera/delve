require "rails_helper"

RSpec.describe "Client errors", type: :request do
  let(:user) { create(:user) }
  let(:report) { {message: "boom 12", page: "/create", stack: "Error: boom\n    at draw (https://delve.test/client/create-AbCd1234.js:10:5)", build: "abc123", details: {lines: ["1.0s log hi"], graphics: "card"}} }
  let(:log_dir) { Rails.root.join("tmp/test-client-errors") }

  before do
    stub_const("ClientErrorLog::KEEP_DAYS", 7)
    allow(ClientErrorLog).to receive(:dir).and_return(log_dir)
    sign_in user
  end

  after { FileUtils.rm_rf(log_dir) }

  it "needs you signed in to report" do
    sign_out user
    post client_errors_path, params: {error: report}, as: :json
    expect(response).to have_http_status(:unauthorized)
    expect(ClientError.count).to eq(0)
  end

  it "counts the same error from the same code as one kind, and logs every one" do
    post client_errors_path, params: {error: report}, as: :json
    later = report.merge(message: "boom 13", stack: report[:stack].sub("AbCd1234", "XyZw9876").sub("10:5", "11:7"))
    post client_errors_path, params: {error: later}, as: :json

    expect(response).to have_http_status(:no_content)
    expect(ClientError.count).to eq(1)
    error = ClientError.first
    expect([error.count, error.message, error.user, error.details["graphics"]]).to eq([2, "boom 13", user, "card"])
    lines = log_dir.glob("*.jsonl").flat_map { |path| path.readlines }
    expect(lines.map { |line| JSON.parse(line)["message"] }).to eq(["boom 12", "boom 13"])
  end

  it "keeps different errors apart" do
    post client_errors_path, params: {error: report}, as: :json
    post client_errors_path, params: {error: report.merge(message: "other")}, as: :json
    expect(ClientError.count).to eq(2)
  end

  it "keeps only the kinds seen most lately" do
    stub_const("ClientError::KEEP_ROWS", 3)
    4.times { |n| ClientError.record!(report.merge(message: "kind #{"x" * n}"), now: Time.current + n) }
    ClientError.record!(report.merge(message: "kind "), now: Time.current + 10)
    ClientError.record!(report.merge(message: "new kind"), now: Time.current + 11)
    expect(ClientError.order(:last_seen_at).pluck(:message)).to eq(["kind xxx", "kind ", "new kind"])
  end

  it "cuts down what's too long" do
    post client_errors_path, params: {error: report.merge(message: "x" * 5_000, details: {lines: ["y" * 50_000]})}, as: :json
    error = ClientError.first
    expect(error.message.length).to eq(1_000)
    expect(error.details).to eq("truncated" => true)
  end

  it "keeps a log file for each day, for a week" do
    log_dir.mkpath
    old = log_dir.join("2026-10-01.jsonl").tap { |path| path.write("{}\n") }
    recent = log_dir.join("#{(Date.current - 6).iso8601}.jsonl").tap { |path| path.write("{}\n") }
    post client_errors_path, params: {error: report}, as: :json
    expect(old).not_to exist
    expect(recent).to exist
    expect(log_dir.join("#{Time.current.utc.to_date.iso8601}.jsonl")).to exist
  end

  it "lists errors only for system admins" do
    post client_errors_path, params: {error: report}, as: :json
    get client_errors_path
    expect(response).to have_http_status(:not_found)

    user.update!(role: "system_admin")
    get client_errors_path
    expect(response).to have_http_status(:ok)
    expect(response.body).to include("boom 12", "/create")
  end
end
