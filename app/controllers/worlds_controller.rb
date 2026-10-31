# The worlds anyone can play, then yours, each kept in a GitHub repo: the ones you've opened, and
# the repos you've granted the app.
class WorldsController < ApplicationController
  before_action :require_github, only: :create

  def index
    @released = World.where.not(released_sha: nil).order(:name, :repo)
    @worlds = current_user.worlds.order(opened_at: :desc)
    @github = current_user.github_connection
    @repos = other_repos if @github
  rescue Github::OauthError => e
    @repos_error = e.message
  end

  # One of your worlds: its published versions on GitHub, and what importing each found.
  def show
    @world = current_user.worlds.find(params[:id])
    @imports = @world.imports.latest_first.to_a
    @github = current_user.github_connection
    @tags = @github&.api&.tags(@world.repo)&.sort_by { |name, _| version_order(name) }&.reverse
  rescue Github::OauthError => e
    @tags_error = e.message
  end

  def create
    repo = @github.api.repo(params.require(:repo))
    return render json: {error: "not_found"}, status: :not_found if repo.nil?

    world = World.find_or_initialize_by(repo: repo["full_name"])
    # Someone else's world opens fine, but stays on their list rather than yours.
    return render json: {recorded: false} if world.persisted? && world.user != current_user

    world.update!(user: current_user, name: params[:name], default_branch: repo["default_branch"], opened_at: Time.current)
    render json: {recorded: true}
  rescue Github::OauthError => e
    render json: {error: e.message}, status: :bad_gateway
  end

  private

  # v10 after v9, then other tags by name.
  def version_order(name)
    number = name[/\Av(\d+)\z/, 1]
    number ? [1, number.to_i, ""] : [0, 0, name]
  end

  def require_github
    @github = current_user.github_connection
    render json: {error: "not_connected"}, status: :unauthorized if @github.nil?
  end

  # The repos you've granted the app that aren't on your list yet, by name.
  def other_repos
    yours = @worlds.pluck(:repo).to_set
    @github.api.repos.reject { |r| yours.include?(r["full_name"]) }.sort_by { |r| r["full_name"].downcase }
  end
end
