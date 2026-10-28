# One published version of a world (a tag the editor's publish step made) brought in to be
# played: the commit the tag pointed at when the import started, and what the validator said about
# it. Tags can be moved, so everything after the import goes by `sha`, never by the tag again.
class WorldImport < ApplicationRecord
  STATUSES = %w[queued running passed failed error].freeze

  belongs_to :world

  validates :tag, presence: true
  validates :status, inclusion: {in: STATUSES}

  scope :latest_first, -> { order(created_at: :desc, id: :desc) }

  def done? = %w[passed failed error].include?(status)

  # Passed the validator; whether it can be released also depends on the repo being public.
  def passed? = status == "passed"

  def errors_found = (problems || []).reject { |p| p["warning"] }

  def warnings_found = (problems || []).select { |p| p["warning"] }
end
