# Keeps the play keys one of your characters has changed, as the play page's key settings send
# them: { keys: { action id => key combo } }, the whole set each time.
class CharacterKeysController < ApplicationController
  def update
    character = current_user.characters.find(params[:character_id])
    keys = request.request_parameters[:keys]
    if character.update(keys: keys.is_a?(Hash) ? keys : nil)
      head :no_content
    else
      head :unprocessable_entity
    end
  end
end
