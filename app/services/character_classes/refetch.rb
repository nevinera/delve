# Re-runs FetchCharacterClassContentJob synchronously for existing classes,
# re-extracting their details and class_abilities from the class file (e.g.
# after ingest logic changes). Continues past classes that fail to fetch,
# returning a {character_class => error message or nil} result per class.
class CharacterClasses::Refetch
  def self.call(...) = new(...).call

  def initialize(identifier: nil)
    @identifier = identifier
  end

  def call
    scope.each_with_object({}) do |character_class, results|
      results[character_class] = refetch(character_class)
    end
  end

  private

  def scope
    classes = CharacterClass.order(:identifier, :version)
    @identifier.present? ? classes.where(identifier: @identifier) : classes
  end

  def refetch(character_class)
    FetchCharacterClassContentJob.perform_now(character_class.id)
    character_class.reload.validity_error
  rescue => e
    e.message
  end
end
