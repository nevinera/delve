class GrantTraineeGearJob < ApplicationJob
  queue_as :default

  # The character's class may not have finished fetching its content yet
  # (a race with FetchCharacterClassContentJob) - retry a few times rather
  # than failing outright.
  retry_on TraineeGear::GrantInitialEquipment::ClassContentNotReady, wait: 5.seconds, attempts: 5

  def perform(character_id)
    TraineeGear::GrantInitialEquipment.call(character: Character.find(character_id))
  end
end
