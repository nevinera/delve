require "rails_helper"

RSpec.describe PollSlotSessionsJob, type: :job do
  let(:character) { create(:character) }
  let(:zone) { create(:zone) }
  let(:token) { SecureRandom.uuid }
  let(:slots_client) { instance_double(GameApi::SlotsClient) }

  def active_response(tokens)
    {"slots" => tokens.map { |t| {"token" => t, "state" => "connected"} }}
  end

  before do
    allow(GameApi).to receive(:slots).and_return(slots_client)
  end

  def stub_active(tokens)
    allow(slots_client).to receive(:active).and_return(active_response(tokens))
  end

  describe "last_confirmed_at updates" do
    it "updates last_confirmed_at for sessions whose token is active" do
      session = create(:slot_session, character: character, zone: zone, token: token)
      stub_active([token])

      described_class.perform_now

      expect(session.reload.last_confirmed_at).to be_within(2.seconds).of(Time.current)
    end

    it "does not update last_confirmed_at for sessions not in the active list" do
      session = create(:slot_session, character: character, zone: zone, token: token)
      stub_active([])

      described_class.perform_now

      expect(session.reload.last_confirmed_at).to be_nil
    end
  end

  describe "stale session pruning" do
    it "destroys sessions whose last_confirmed_at is older than the threshold" do
      session = create(:slot_session, character: character, zone: zone, token: token,
        last_confirmed_at: (PollSlotSessionsJob::STALE_THRESHOLD + 1.minute).ago)
      stub_active([])

      described_class.perform_now

      expect(SlotSession.exists?(session.id)).to be false
    end

    it "destroys sessions with nil last_confirmed_at created beyond the threshold" do
      session = create(:slot_session, character: character, zone: zone, token: token)
      session.update_column(:created_at, (PollSlotSessionsJob::STALE_THRESHOLD + 1.minute).ago)
      stub_active([])

      described_class.perform_now

      expect(SlotSession.exists?(session.id)).to be false
    end

    it "keeps sessions whose last_confirmed_at is within the threshold" do
      session = create(:slot_session, character: character, zone: zone, token: token,
        last_confirmed_at: 1.minute.ago)
      stub_active([])

      described_class.perform_now

      expect(SlotSession.exists?(session.id)).to be true
    end

    it "keeps recently created sessions with nil last_confirmed_at" do
      session = create(:slot_session, character: character, zone: zone, token: token)
      stub_active([])

      described_class.perform_now

      expect(SlotSession.exists?(session.id)).to be true
    end

    it "refreshes a session before it goes stale if the token is still active" do
      session = create(:slot_session, character: character, zone: zone, token: token,
        last_confirmed_at: (PollSlotSessionsJob::STALE_THRESHOLD + 1.minute).ago)
      stub_active([token])

      described_class.perform_now

      expect(SlotSession.exists?(session.id)).to be true
      expect(session.reload.last_confirmed_at).to be_within(2.seconds).of(Time.current)
    end
  end
end
