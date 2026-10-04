# Lets the class editor (see issue #135) ask the game server how long a draft
# character class survives the reference pulls from docs/combat_balance.md,
# once per stat priority and elevation. Same request shape as
# Build::ClassDpsSimsController.
class Build::ClassTtdSimsController < Build::BaseController
  include ClassSimErrors

  def character_class
    data = JSON.parse(request.body.read)
    Validators::CharacterClassValidator.validate!(data["class"])
    render json: GameApi::ClassTtdSimClient.new.simulate({class: data["class"], strategy: data["strategy"] || [], extended: data["extended"]}.compact)
  end
end
