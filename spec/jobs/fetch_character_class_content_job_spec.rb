require "rails_helper"

RSpec.describe FetchCharacterClassContentJob, type: :job do
  let(:user) { create(:user) }
  let(:character_class) { create(:character_class, user: user) }
  let(:content) do
    '{"name":"Puncher","description":"Hits things","colors":{"major":"8B4513","minor":"F4A460"},' \
      '"primaryStats":["strength"],"secondaryStats":["stamina","crit_rating","haste_rating","mastery_rating","versatility_rating"],' \
      '"wields":["dagger","dagger"],' \
      '"resources":[{"name":"energy","color":"FFDD00","max":100,"defaultValue":100,"isFluid":true,"displayType":"primary"}],' \
      '"powers":[{"name":"Punch","iconURL":"../icons/punch.svg","castTime":null,"globalCooldown":0.5,' \
      '"effects":[{"type":"harm","affects":"bTarget","amount":10,"range":5}]}]}'
  end

  before do
    stub_request(:get, character_class.location).to_return(body: content, status: 200)
  end

  it "updates state to fetched" do
    described_class.perform_now(character_class.id)
    expect(character_class.reload.state).to eq("fetched")
  end

  it "stores a SHA1 hash of the response body" do
    described_class.perform_now(character_class.id)
    expect(character_class.reload.content_sha).to eq(Digest::SHA1.hexdigest(content))
  end

  it "stores the byte size of the response body" do
    described_class.perform_now(character_class.id)
    expect(character_class.reload.file_size).to eq(content.bytesize)
  end

  it "stores primary_stats and secondary_stats from the fetched content" do
    described_class.perform_now(character_class.id)
    character_class.reload
    expect(character_class.primary_stats).to eq(["strength"])
    expect(character_class.secondary_stats).to eq(%w[stamina crit_rating haste_rating mastery_rating versatility_rating])
  end

  it "stores wields from the fetched content" do
    described_class.perform_now(character_class.id)
    expect(character_class.reload.wields).to eq(%w[dagger dagger])
  end

  it "stores name and description from the fetched content" do
    described_class.perform_now(character_class.id)
    character_class.reload
    expect(character_class.name).to eq("Puncher")
    expect(character_class.description).to eq("Hits things")
  end

  it "extracts class abilities from the fetched powers" do
    described_class.perform_now(character_class.id)
    expect(character_class.reload.class_abilities.map(&:name)).to eq(["Punch"])
  end

  it "raises when the URL returns a non-success response" do
    stub_request(:get, character_class.location).to_return(status: 404)
    expect { described_class.perform_now(character_class.id) }.to raise_error(RuntimeError, /HTTP 404/)
  end
end
