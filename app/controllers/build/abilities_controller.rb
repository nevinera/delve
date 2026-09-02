class Build::AbilitiesController < Build::BaseController
  skip_authorization_check only: [:index, :show]

  def index
    @abilities = Github::ContentClient.new(current_user).list_directory("abilities")
  end

  def show
    content = Github::ContentClient.new(current_user).file_content("abilities/#{params[:id]}.json")
    @ability = JSON.parse(content)
  end
end
