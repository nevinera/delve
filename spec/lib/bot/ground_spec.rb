require "rails_helper"

RSpec.describe Bot::Ground do
  # The plate and the walker's ground on it, from game-server/internal/worlds/testdata/plate.mjs.
  let(:testdata) { Rails.root.join("game-server/internal/worlds/testdata") }
  let(:fetched) { [] }
  let(:ground) do
    plate = testdata.join("surface_0_0.plate").read
    described_class.new(repo: "me/w", sha: "c0ffee", continent: "main", fetch: ->(url) {
      fetched << url
      plate if url.end_with?("/0_0.plate")
    })
  end

  it "finds the ground and water the browser's walker finds" do
    JSON.parse(testdata.join("ground.json").read).each do |point|
      x, z = point["at"]
      sample = ground.at(x, z)
      if point["ground"].nil?
        expect(sample).to be_nil, "at #{point["at"]}"
      else
        expect(sample[:ground]).to be_within(1e-6).of(point["ground"]), "at #{point["at"]}"
        expect(sample[:water]).to eq(point["water"]), "at #{point["at"]}"
      end
    end
    expect(fetched).to include("https://raw.githubusercontent.com/me/w/c0ffee/places/continents/main/plates/surface/0_0.plate")
    expect(fetched).to eq(fetched.uniq) # each plate once
  end

  it "stands on the ground, or swims in deep water" do
    expect(ground.stand(100, 100)).to eq([ground.at(100, 100)[:ground], false])
    expect(ground.stand(600, 100)).to eq([0.5, true])
    expect(ground.stand(530, 8)).to eq([3.0, false])
    expect(ground.stand(1030, 10)).to be_nil
  end
end
