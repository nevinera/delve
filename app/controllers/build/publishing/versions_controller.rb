# Registers a world version by hand (from a tag the builder made
# themselves), and releases or reimports existing ones. The
# world editor's Publish button (Build::WorldsController#publish) creates
# the tag and the version in one step instead.
class Build::Publishing::VersionsController < Build::BaseController
  before_action :load_world

  def new
    authorize! :manage, @world
    @version = @world.world_versions.build
  end

  def create
    authorize! :manage, @world
    @version = @world.world_versions.build(version_params)
    error = ref_error || save_error
    return render_new_with_error(error) if error

    redirect_to build_publishing_world_path(@world), notice: "Importing #{@version.ref}."
  end

  def release
    version = find_version
    version.release!
    redirect_to build_publishing_world_path(@world), notice: "Released #{version.ref}."
  rescue ArgumentError => e
    redirect_to build_publishing_world_path(@world), alert: e.message
  end

  def reimport
    version = find_version
    unless version.failed?
      return redirect_to build_publishing_world_path(@world), alert: "Only failed versions can be reimported."
    end
    version.update!(state: :importing, validity_error: nil)
    version.import
    redirect_to build_publishing_world_path(@world), notice: "Reimporting #{version.ref}."
  end

  private

  def load_world
    @world = current_user.worlds.find(params[:world_id])
  end

  def find_version
    @world.world_versions.find(params[:id]).tap { |version| authorize! :manage, version }
  end

  def version_params
    params.require(:world_version).permit(:ref)
  end

  def content_client
    @content_client ||= Github::ContentClient.new(current_user)
  end

  def render_new_with_error(message)
    flash.now[:alert] = message
    render :new, status: :unprocessable_content
  end

  def save_error
    @version.errors.full_messages.to_sentence unless @version.save
  end

  # Checked up front, so a typo fails here rather than as a failed import.
  def ref_error
    repo_error || tag_error
  end

  def repo_error
    return "Your GitHub connection points at #{content_client.repo}, not #{@world.repo}." unless content_client.repo == @world.repo
    "#{@world.repo} is private; worlds must be published from a public repo." unless content_client.public_repo?
  end

  def tag_error
    return "Ref is required." if @version.ref.blank?
    content_client.tag_sha(@version.ref)
    nil
  rescue Github::NotFoundError
    "Tag \"#{@version.ref}\" doesn't exist in #{@world.repo}."
  end
end
