require "rails_helper"

RSpec.describe LeaveWorld do
  subject(:call) { described_class.call(character:, world: version.world) }

  let(:character) { create(:character) }
  let(:version) { published_world }
  let(:slots_client) { instance_double(GameApi::SlotsClient, destroy: nil) }

  before { allow(GameApi).to receive(:slots).and_return(slots_client) }

  context "when the character is in the world" do
    let!(:session) { create(:slot_session, character:, zone: version.zones.first) }

    it "removes the game-server slot" do
      call
      expect(slots_client).to have_received(:destroy)
        .with(instance_id: session.instance_identifier, slot_id: session.slot_id)
    end

    it "removes the slot session" do
      expect { call }.to change(SlotSession, :count).by(-1)
    end

    it "still removes the session when the slot is already gone" do
      allow(slots_client).to receive(:destroy).and_raise(GameApi::NotFoundError.new("gone", status: 404))
      expect { call }.to change(SlotSession, :count).by(-1)
    end
  end

  it "leaves a session in another world alone" do
    other = published_world(world: create(:world, path: "worlds/other.json"))
    create(:slot_session, character:, zone: other.zones.first)
    expect { call }.not_to change(SlotSession, :count)
    expect(slots_client).not_to have_received(:destroy)
  end

  it "does nothing when the character isn't in a world" do
    expect { call }.not_to raise_error
    expect(slots_client).not_to have_received(:destroy)
  end
end
