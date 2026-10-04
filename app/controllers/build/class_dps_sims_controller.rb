# Lets the class editor (see issue #75) ask the game server how hard a
# draft character class hits across its (elevation x duration) matrix, given
# a caller-authored strategy (priority-list rotation). Same request shape as
# Build::ValidatorsController#character_class for the class itself; strategy
# is calculator-specific (not part of the authored content schema) and isn't
# separately validated here - an unrecognized power name in it is silently
# never cast, not an error, same as the game server's own selectPower.
class Build::ClassDpsSimsController < Build::BaseController
  include ClassSimErrors

  def character_class
    data = JSON.parse(request.body.read)
    Validators::CharacterClassValidator.validate!(data["class"])
    render json: GameApi::ClassDpsSimClient.new.simulate({class: data["class"], strategy: data["strategy"] || [], extended: data["extended"]}.compact)
  end
end
