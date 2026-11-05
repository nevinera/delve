# Every client error, a line of JSON each, in a file for each day (UTC) in log/client_errors.
# Files more than KEEP_DAYS old are deleted as new ones are written.
module ClientErrorLog
  KEEP_DAYS = 7

  module_function

  def dir = Rails.root.join("log/client_errors")

  def write(entry, now: Time.current)
    dir.mkpath
    File.open(dir.join("#{now.utc.to_date.iso8601}.jsonl"), "a") do |file|
      file.flock(File::LOCK_EX)
      file.puts(entry.to_json)
    end
    prune(now: now)
  end

  def prune(now: Time.current)
    oldest = now.utc.to_date - (KEEP_DAYS - 1)
    dir.glob("*.jsonl").each do |path|
      day = Date.iso8601(path.basename(".jsonl").to_s)
      path.delete if day < oldest
    rescue Date::Error
      next
    end
  end
end
