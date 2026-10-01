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

    it "pushes the new expiry to the earlier versions' running instances" do
      earlier = create(:world_version, :released, world:)
      already_expiring = create(:world_version, :released, world:, expires_at: 1.hour.from_now)
      version = create(:world_version, world:)
      expect { version.release! }.to have_enqueued_job(PushWorldVersionExpiryJob).with(earlier.id).exactly(:once)
      expect(PushWorldVersionExpiryJob).not_to have_been_enqueued.with(already_expiring.id)
    end

    it "gives the world this version's name" do
      world.update!(name: "Old Name")
      create(:world_version, world:, name: "New Name").release!
      expect(world.reload.name).to eq("New Name")
    end

    it "doesn't touch other worlds" do
      other = create(:world_version, :released)
      create(:world_version, world:).release!
      expect(other.reload.expires_at).to be_nil
    end

    it "refuses a version that isn't unreleased" do
      expect { create(:world_version, :importing, world:).release! }.to raise_error(ArgumentError)
      expect { create(:world_version, :released, world:).release! }.to raise_error(ArgumentError)
    end
  end

  describe "#zone_url" do
    it "joins the raw base url and the zone path" do
      version = build(:world_version, raw_base_url: "https://raw.githubusercontent.com/a/b/abc/")
      zone = build(:zone, world_version: version, path: "zones/x/x.full.json")
      expect(version.zone_url(zone)).to eq("https://raw.githubusercontent.com/a/b/abc/zones/x/x.full.json")
    end
  end
end
