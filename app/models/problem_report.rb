# Something a player reported from a page's report button: a bug, a wish or an annoyance, with a
# note, a voice note and a screenshot. Its files are in storage/problem_reports/<id> until it's done.
class ProblemReport < ApplicationRecord
  KINDS = {
    "bug" => "Something's broken",
    "object" => "An object I wish I had",
    "template" => "A structure I wish I had",
    "how" => "Something I can't work out how to do",
    "annoying" => "Something that's annoying"
  }.freeze
  VOICE_TYPES = {"audio/webm" => "webm", "audio/ogg" => "ogg", "audio/mp4" => "m4a"}.freeze
  NOTE_LIMIT = 4_000
  DETAILS_LIMIT = 40_000 # bytes of JSON
  VOICE_LIMIT = 8.megabytes
  SCREENSHOT_LIMIT = 3.megabytes

  belongs_to :user, optional: true
  validates :kind, inclusion: {in: KINDS.keys}
  validates :voice_type, inclusion: {in: VOICE_TYPES.keys}, allow_nil: true

  scope :open, -> { where(done_at: nil) }

  def self.dir = Rails.root.join("storage/problem_reports")

  # Keeps a report from the page's form: kind, note, page, build, details (JSON text), voice and
  # screenshot (uploads, either left out).
  def self.file!(params, user:)
    details = parse_details(params[:details])
    voice = upload(params[:voice], VOICE_LIMIT)
    screen = upload(params[:screenshot], SCREENSHOT_LIMIT)
    voice_type = voice && VOICE_TYPES.keys.find { |type| voice.content_type.to_s.start_with?(type) }
    report = create!(user: user, kind: params[:kind], note: params[:note].to_s.first(NOTE_LIMIT).presence,
      page: params[:page].to_s.first(500), build: params[:build].to_s.first(200), details: details,
      voice_type: voice_type, screenshot: screen.present?)
    report.files_dir.mkpath if voice_type || screen
    FileUtils.cp(voice.path, report.voice_path) if voice_type
    FileUtils.cp(screen.path, report.screenshot_path) if screen
    report
  end

  def self.parse_details(text)
    details = JSON.parse(text.presence || "{}")
    return {} unless details.is_a?(Hash)
    (details.to_json.bytesize > DETAILS_LIMIT) ? {truncated: true} : details
  rescue JSON::ParserError
    {}
  end

  def self.upload(file, limit)
    file if file.respond_to?(:path) && file.size.between?(1, limit)
  end

  def files_dir = self.class.dir.join(id.to_s)

  def voice_path = voice_type && files_dir.join("voice.#{VOICE_TYPES[voice_type]}")

  def screenshot_path = files_dir.join("screenshot.jpg")

  def kind_title = KINDS[kind]

  # Marks it done, and deletes its voice note and screenshot.
  def done!
    FileUtils.rm_rf(files_dir)
    update!(done_at: Time.current, voice_type: nil, screenshot: false)
  end
end
