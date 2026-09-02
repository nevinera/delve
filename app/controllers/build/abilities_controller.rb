class Build::AbilitiesController < Build::BaseController
  skip_authorization_check only: [:index, :show, :edit]
  layout "build_client", only: :edit

  MIME_TYPES = {
    ".svg" => "image/svg+xml", ".png" => "image/png", ".webp" => "image/webp",
    ".jpg" => "image/jpeg", ".jpeg" => "image/jpeg", ".gif" => "image/gif",
    ".ogg" => "audio/ogg", ".mp3" => "audio/mpeg", ".wav" => "audio/wav"
  }.freeze

  def index
    @abilities = Github::ContentClient.new(current_user).list_directory("abilities")
  end

  def show
    load_ability
  end

  def edit
    load_ability
  end

  private

  def load_ability
    content = Github::ContentClient.new(current_user).file_content("abilities/#{params[:id]}.json")
    @ability = JSON.parse(content)
    @asset_thumbnails = fetch_asset_thumbnails(@ability)
  end

  def fetch_asset_thumbnails(data)
    client = Github::ContentClient.new(current_user)
    collect_asset_urls(data).index_with { |url| asset_data_uri(client, url) }.compact
  end

  def collect_asset_urls(data)
    case data
    when Hash
      data.flat_map { |key, value| (key.end_with?("URL") && value.is_a?(String)) ? [value] : collect_asset_urls(value) }
    when Array
      data.flat_map { |value| collect_asset_urls(value) }
    else
      []
    end
  end

  def asset_data_uri(client, relative_url)
    mime_type = MIME_TYPES[File.extname(relative_url).downcase]
    return nil unless mime_type

    resolved_path = Pathname.new("abilities").join(relative_url).cleanpath.to_s
    "data:#{mime_type};base64,#{Base64.strict_encode64(client.file_content(resolved_path))}"
  rescue Github::ReauthRequiredError
    raise
  rescue
    nil
  end
end
