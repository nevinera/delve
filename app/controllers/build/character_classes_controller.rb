# Character class *records* (a class file registered by URL), as opposed to
# Build::ClassesController, which edits class content. Refetching re-reads
# the class file: after it's edited, its recorded checksum no longer
# matches and nobody can play the class until it's refetched (see
# JoinZone#class_config).
class Build::CharacterClassesController < Build::BaseController
  def refetch
    character_class = CharacterClass.find(params[:id])
    authorize! :manage, character_class
    FetchCharacterClassContentJob.perform_now(character_class.id)
    error = character_class.reload.validity_error
    if error
      redirect_back_or_to play_characters_path, alert: "#{character_class.identifier} refetched, but it's invalid: #{error}"
    else
      redirect_back_or_to play_characters_path, notice: "#{character_class.identifier} refetched."
    end
  rescue RuntimeError => e
    redirect_back_or_to play_characters_path, alert: "Couldn't refetch #{character_class.identifier}: #{e.message}"
  end
end
