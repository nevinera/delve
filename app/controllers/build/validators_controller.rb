# Lets the browser-side editors (see client/src/editor, client/src/classEditor)
# check a draft against the same Validators::* classes the server already
# requires for FetchAbilityContentJob/FetchCharacterClassContentJob, rather
# than re-implementing that (constantly-changing) schema a second time in JS.
class Build::ValidatorsController < Build::BaseController
  skip_authorization_check only: [:ability, :character_class, :unit_type]

  def ability
    validate_with(Validators::AbilityValidator)
  end

  # The class editor validates the resolved (.full.json) form, not the
  # abstract one it actually saves - CharacterClassValidator rejects $ref
  # powers outright (see "full JSON required" in ability_validator.rb via
  # Helpers#reject_asset_reference!), since only the concrete file is
  # meant to satisfy the schema.
  def character_class
    validate_with(Validators::CharacterClassValidator)
  end

  # Same reasoning as #character_class: the unit type editor validates the
  # resolved form, since UnitTypeValidator's powers rejects $ref entries too.
  def unit_type
    validate_with(Validators::UnitTypeValidator)
  end

  private

  def validate_with(validator_class)
    validator_class.validate!(request_data)
    render json: {valid: true}
  rescue Validators::ValidationError => e
    render json: {valid: false, error: {message: e.message, path: e.path}}
  rescue JSON::ParserError
    render json: {valid: false, error: {message: "request body must be valid JSON", path: "$"}}, status: :bad_request
  end

  def request_data
    JSON.parse(request.body.read)
  end
end
