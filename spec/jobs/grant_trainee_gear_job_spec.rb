require "rails_helper"

RSpec.describe GrantTraineeGearJob, type: :job do
  let(:user) { create(:user) }
  let(:character_class) do
    create(:character_class, user: user,
      primary_stats: ["strength"],
      secondary_stats: %w[crit_rating haste_rating mastery_rating versatility_rating stamina],
      wields: %w[dagger dagger])
  end
  let(:character) { create(:character, user: user, character_class: character_class) }

  it "grants Trainee Gear for the character" do
    expect { described_class.perform_now(character.id) }
      .to change(character.character_items, :count).from(0).to(14)
  end

  it "is configured to retry ClassContentNotReady rather than fail outright" do
    handled = described_class.rescue_handlers.map(&:first)
    expect(handled).to include("TraineeGear::GrantInitialEquipment::ClassContentNotReady")
  end
end
