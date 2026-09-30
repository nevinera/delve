# Registers a world version by hand (a tag the builder made themselves, or
# a beta tracking a branch), and releases or reimports existing ones. The
# world editor's Publish button (Build::WorldsController#publish) creates
# the tag and the version in one step instead.
class Build::Publishing::VersionsController < Build::BaseController
  before_action :load_world

  def new
    authorize! :manage, @world
    @version = @world.world_versions.build(ref_kind: params[:ref_kind].presence || "tag")
    @version.ref = content_client.default_branch if @version.branch?
  end

  def create
    authorize! :manage, @world
    @version = @world.world_versions.build(version_params)
    error = ref_error
    if error
      flash.now[:alert] = error
      render :new, status: :unprocessable_content
    elsif @version.save
      redirect_to build_publishing_world_path(@world), notice: "Importing #{@version.ref}."
    else
      flash.now[:alert] = @version.errors.full_messages.to_sentence
      render :new, status: :unprocessable_content
    end
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
    unless version.branch? || version.failed?
      return redirect_to build_publishing_world_path(@world), alert: "Only betas and failed versions can be reimported."
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
    params.require(:world_version).permit(:ref, :ref_kind)
  end

  def content_client
    @content_client ||= Github::ContentClient.new(current_user)
  end

  # Checked up front, so a typo fails here rather than as a failed import.
  def ref_error
    return "Your GitHub connection points at #{content_client.repo}, not #{@world.repo}." unless content_client.repo == @world.repo
    return "#{@world.repo} is private; worlds must be published from a public repo." unless content_client.public_repo?
    return "Ref is required." if @version.ref.blank?
    @version.tag? ? content_client.tag_sha(@version.ref) : content_client.branch_sha(@version.ref)
    nil
  rescue Github::NotFoundError
    "#{@version.tag? ? "Tag" : "Branch"} \"#{@version.ref}\" doesn't exist in #{@world.repo}."
  end
end
