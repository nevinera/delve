require "rails_helper"

RSpec.describe "Metrics", type: :request do
  include ActiveSupport::Testing::TimeHelpers

  let(:user) { create(:user) }
  let(:batch) do
    {tags: {page: "play", device: "phone"},
     metrics: [
       {name: "play.load.platters", kind: "timing", value: 900.5, at: 2000, tags: {world: "northvale"}},
       {name: "play.joins", kind: "count", value: 1, at: 0}
     ]}
  end

  before { sign_in user }

  it "needs you signed in" do
    sign_out user
    post metrics_path, params: batch, as: :json
    expect(response).to have_http_status(:unauthorized)
    expect(Metric.count).to eq(0)
  end

  it "keeps each measurement with the batch's tags and when it was measured" do
    freeze_time do
      post metrics_path, params: batch, as: :json
      expect(response).to have_http_status(:no_content)
      platters = Metric.find_by(name: "play.load.platters")
      expect([platters.kind, platters.value, platters.user_id, platters.recorded_at]).to eq(["timing", 900.5, user.id, 2.seconds.ago])
      expect(platters.tags).to eq("page" => "play", "device" => "phone", "world" => "northvale")
      expect(Metric.find_by(name: "play.joins").tags).to eq("page" => "play", "device" => "phone")
    end
  end

  it "leaves out measurements that don't make sense" do
    bad = [{name: "Bad Name", kind: "timing", value: 1}, {name: "ok", kind: "nope", value: 1}, {name: "ok", kind: "count", value: "3"}, "junk"]
    post metrics_path, params: {metrics: bad}, as: :json
    expect(response).to have_http_status(:no_content)
    expect(Metric.count).to eq(0)
  end
end

RSpec.describe Metric do
  it "prunes what's older than it keeps" do
    Metric.create!(name: "a", kind: "count", value: 1, recorded_at: 31.days.ago)
    Metric.create!(name: "a", kind: "count", value: 1, recorded_at: 29.days.ago)
    Metric.prune
    expect(Metric.count).to eq(1)
  end

  it "sums up by name and by a tag" do
    [100, 200, 300].each { |v| Metric.create!(name: "load", kind: "timing", value: v, tags: {"device" => "phone"}, recorded_at: 1.hour.ago) }
    Metric.create!(name: "load", kind: "timing", value: 50, tags: {"device" => "desktop"}, recorded_at: 1.hour.ago)
    expect(Metric.summary.first).to include(name: "load", count: 4, max: 300.0)
    expect(Metric.summary(by: "device").map { |row| row.values_at("device", :count, :p50) }).to eq([["desktop", 1, 50.0], ["phone", 3, 200.0]])
  end
end
