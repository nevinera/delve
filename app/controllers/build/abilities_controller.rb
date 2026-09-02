class Build::AbilitiesController < Build::BaseController
  skip_authorization_check only: [:index, :show]

  def index
    @abilities = Github::ContentClient.new(current_user).list_directory("abilities")
  rescue Github::NoRepositoryError
    redirect_to github_connect_path
  rescue Github::ReauthRequiredError
    redirect_to github_reauth_path, alert: "Your GitHub authorization has expired. Please reconnect."
  end

  def show
    content = Github::ContentClient.new(current_user).file_content("abilities/#{params[:id]}.json")
    @json = JSON.pretty_generate(JSON.parse(content))
  rescue Github::NoRepositoryError
    redirect_to github_connect_path
  rescue Github::ReauthRequiredError
    redirect_to github_reauth_path, alert: "Your GitHub authorization has expired. Please reconnect."
  end
end
