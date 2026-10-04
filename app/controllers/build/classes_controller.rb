class Build::ClassesController < Build::BaseController
  include Build::BranchSelection
  include Build::ClassPublishing

  skip_authorization_check only: [:index, :new, :create, :edit]
  layout "build_class_client", only: :edit

  KEY_FORMAT = Build::AbilitiesController::KEY_FORMAT

  def index
    client = Github::ContentClient.new(current_user)
    select_branch(client)
    @classes = client.list_directory_recursive("classes", ref: @branch)
      .select { |entry| entry["name"].end_with?(".json") && !entry["name"].end_with?(".full.json") }
      .sort_by { |entry| entry["path"] }
  end

  def new
    Github::ContentClient.new(current_user) # raises (and BaseController redirects) if there's no repo connected yet
    @key = ""
    @branch = params[:branch].to_s
  end

  def create
    @key = params[:key].to_s.strip
    @branch = params[:branch].to_s
    error = key_error
    return render_new_with_error(error) if error

    redirect_to edit_build_class_path(id: @key, branch: @branch.presence)
  end

  # No class content, or its available abilities, are fetched here - the
  # editor fetches both itself, client-side, on mount (see
  # client/src/classEditor/ClassEditor.jsx and plans/editor-git.md). Still
  # checks for a connected repo up front, the same way #new does.
  def edit
    Github::ContentClient.new(current_user)
    @stock_assets = Content::StockAssets.client_json
    @next_version = next_class_version(params[:id])
  end

  # Publish: tags the branch's head as "<key>-<version>" - only if it's still
  # the commit the editor last loaded or saved (expected_sha), and the class
  # there validates - and registers that tag as a new class version.
  # Responds with the version's identifier and number.
  def publish
    authorize! :create, CharacterClass
    client = Github::ContentClient.new(current_user)
    error = class_publish_request_error(client)
    return render_publish_error(error) if error

    render json: publish_class!(client, params[:id], publish_version, expected_sha).slice(:identifier, :version)
  rescue Github::ApiError, ActiveRecord::RecordInvalid => e
    render_publish_error(e.message)
  end

  private

  def publish_version = params[:version].to_s.strip

  def expected_sha = params[:expected_sha].to_s

  def render_publish_error(error) = render(json: {error:}, status: :unprocessable_content)

  def class_publish_request_error(client)
    class_publish_error(client, params[:id], publish_version) ||
      branch_error(client, params[:branch].to_s, expected_sha) ||
      class_content_error(client, params[:id], expected_sha)
  end

  def key_error
    return "Key is required." if @key.blank?
    return "Key must contain only letters, numbers, underscores, hyphens, and \"/\" to place it in a subdirectory." unless @key.match?(KEY_FORMAT)
    "\"#{@key}\" is already taken." if class_key_taken?(@key)
  end

  def render_new_with_error(message)
    flash.now[:alert] = message
    render :new, status: :unprocessable_content
  end

  def class_key_taken?(key)
    Github::ContentClient.new(current_user).list_directory_recursive("classes", ref: @branch.presence).any? { |entry| entry["path"] == "classes/#{key}.json" }
  end
end
