# The animation lab, for working on animations: any clip on any of your characters, at any speed.
class AnimationLabController < ApplicationController
  layout "animation_lab"
  system_admins_only

  def show
    @characters = current_user.characters.order(:name).map { |character| {name: character.name, look: character.look} }
  end
end
