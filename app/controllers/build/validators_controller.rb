# Lets the browser-side editors (see client/src/editor, client/src/classEditor)
# check a draft against the same Validators::* classes the server already
# requires for FetchAbilityContentJob/FetchCharacterClassContentJob, rather
# than re-implementing that (constantly-changing) schema a second time in JS.
class Build::ValidatorsController < Build::BaseController
  skip_authorization_check only: [:ability]

  def ability
    Validators::AbilityValidator.validate!(request_data)
    render json: {valid: true}
  rescue Validators::ValidationError => e
    render json: {valid: false, error: {message: e.message, path: e.path}}
  rescue JSON::ParserError
    render json: {valid: false, error: {message: "request body must be valid JSON", path: "$"}}, status: :bad_request
  end

  private

  def request_data
    JSON.parse(request.body.read)
  end
end
