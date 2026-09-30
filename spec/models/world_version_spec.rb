require "rails_helper"

RSpec.describe WorldVersion, type: :model do
  include ActiveSupport::Testing::TimeHelpers

  let(:world) { create(:world) }

  describe "validations" do
    it "is valid with valid attributes" do
      expect(build(:world_version, world:)).to be_valid
    end

    it "requires ref to be unique within a world" do
      create(:world_version, world:, ref: "v1")
      expect(build(:world_version, world:, ref: "v1")).not_to be_valid
      expect(build(:world_version, ref: "v1")).to be_valid
    end
  end

  it "generates a share token" do
    expect(create(:world_version, world:).share_token).to be_present
  end

  describe ".available" do
    it "includes released versions that haven't expired" do
      open_ended = create(:world_version, :released, world:)
      expiring = create(:world_version, :released, world:, expires_at: 1.hour.from_now)
      create(:world_version, :released, world:, expires_at: 1.hour.ago)
      create(:world_version, world:)
      expect(described_class.available).to contain_exactly(open_ended, expiring)
    end
  end

  describe "#release!" do
    it "releases an unreleased tag version" do
      version = create(:world_version, world:)
      version.release!
      expect(version.reload).to be_released
      expect(version.released_at).to be_present
    end

    it "starts the expiry clock on earlier released versions" do
      earlier = create(:world_version, :released, world:)
      version = create(:world_version, world:)
      freeze_time do
        version.release!
        expect(earlier.reload.expires_at).to eq(Time.current + WorldVersion::EXPIRY_GRACE)
        expect(version.reload.expires_at).to be_nil
      end
    end

    it "leaves an already-expiring version's expiry alone" do
      expiring = create(:world_version, :released, world:, expires_at: 1.hour.from_now)
      expect { create(:world_version, world:).release! }.not_to(change { expiring.reload.expires_at })
    end

    it "doesn't touch betas or other worlds" do
      beta = create(:world_version, :beta, world:)
      other = create(:world_version, :released)
      create(:world_version, world:).release!
      expect(beta.reload.expires_at).to be_nil
      expect(other.reload.expires_at).to be_nil
    end

    it "refuses a beta" do
      expect { create(:world_version, :beta, world:).release! }.to raise_error(ArgumentError)
    end

    it "refuses a version that isn't unreleased" do
      expect { create(:world_version, :importing, world:).release! }.to raise_error(ArgumentError)
      expect { create(:world_version, :released, world:).release! }.to raise_error(ArgumentError)
    end
  end

  describe "#zone_url" do
    it "joins the raw base url and the zone path" do
      version = build(:world_version, raw_base_url: "https://raw.githubusercontent.com/a/b/abc/")
      zone = build(:zone, :in_world, world_version: version, path: "zones/x/x.full.json")
      expect(version.zone_url(zone)).to eq("https://raw.githubusercontent.com/a/b/abc/zones/x/x.full.json")
    end
  end
end
