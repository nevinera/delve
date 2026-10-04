class Build::AbilitiesController < Build::BaseController
  include Build::BranchSelection

  skip_authorization_check only: [:index, :new, :create, :edit]
  layout "build_client", only: :edit

  # Each "/"-separated segment is a directory (e.g. "classes/druid/wildshape"
  # → abilities/classes/druid/wildshape.json) - lets abilities be organized
  # into subdirectories instead of all living flat in abilities/.
  KEY_FORMAT = %r{\A[a-zA-Z0-9_-]+(?:/[a-zA-Z0-9_-]+)*\z}

  def index
    client = Github::ContentClient.new(current_user)
    select_branch(client)
    entries = client.list_directory_recursive("abilities", ref: @branch)
    @abilities = entries.select { |entry| entry["name"].end_with?(".json") }.sort_by { |entry| entry["path"] }
  end

  def new
    Github::ContentClient.new(current_user) # raises (and BaseController redirects) if there's no repo connected yet
    @key = params[:key].to_s
    @branch = params[:branch].to_s
  end

  def create
    @key = params[:key].to_s.strip
    @branch = params[:branch].to_s
    error = key_error
    return render_new_with_error(error) if error

    redirect_to edit_build_ability_path(id: @key, branch: @branch.presence)
  end

  # No ability content (or its asset URLs) is fetched here - the editor
  # fetches its own content client-side on mount, and resolves asset URLs
  # to raw.githubusercontent.com links with no fetch at all (see
  # client/src/abilityEditor/AbilityEditor.jsx and plans/editor-git.md). Still
  # checks for a connected repo up front, the same way #new does.
  # Content::StockAssets isn't GitHub-backed at all, so it stays exactly
  # as it was.
  def edit
    Github::ContentClient.new(current_user)
    @stock_assets = Content::StockAssets.client_json
  end

  private

  def key_error
    return "Key is required." if @key.blank?
    return "Key must contain only letters, numbers, underscores, hyphens, and \"/\" to place it in a subdirectory." unless @key.match?(KEY_FORMAT)
    "\"#{@key}\" is already taken." if ability_key_taken?(@key)
  end

  def render_new_with_error(message)
    flash.now[:alert] = message
    render :new, status: :unprocessable_content
  end

  def ability_key_taken?(key)
    Github::ContentClient.new(current_user).list_directory_recursive("abilities", ref: @branch.presence).any? { |entry| entry["path"] == "abilities/#{key}.json" }
  end
end
