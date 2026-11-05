# An error a browser reported, one row for each kind: the same message from the same place in the
# code. The row keeps the latest one in full, and every one also goes to ClientErrorLog. Only the
# KEEP_ROWS kinds seen most lately are kept.
class ClientError < ApplicationRecord
  belongs_to :user, optional: true

  LIMITS = {message: 1_000, page: 500, stack: 8_000, build: 200}.freeze
  DETAILS_LIMIT = 40_000 # bytes of JSON
  KEEP_ROWS = 100

  # Keeps one report, from params the page sent. Gives the row it's counted in.
  def self.record!(report, user: nil, now: Time.current)
    fields = LIMITS.to_h { |key, limit| [key, report[key].to_s.first(limit).presence] }
    details = report[:details].is_a?(Hash) ? report[:details] : {}
    details = {truncated: true} if details.to_json.bytesize > DETAILS_LIMIT
    fields[:message] ||= "(no message)"
    ClientErrorLog.write(fields.merge(at: now.iso8601(3), user_id: user&.id, details: details))

    row = find_or_initialize_by(fingerprint: fingerprint(fields[:message], fields[:stack]))
    row.assign_attributes(fields.merge(user: user, details: details, last_seen_at: now))
    row.first_seen_at ||= now
    added = row.new_record?
    row.count = added ? 1 : row.count + 1
    row.save!
    prune if added
    row
  rescue ActiveRecord::RecordNotUnique
    retry
  end

  def self.prune
    where.not(id: order(last_seen_at: :desc, id: :desc).limit(KEEP_ROWS).select(:id)).delete_all
  end

  # The same for the same error from the same code: numbers and build hashes don't count.
  def self.fingerprint(message, stack)
    first_frame = stack.to_s.lines.find { |line| line.include?(":") && !line.strip.start_with?(message.to_s.first(20)) }.to_s
    place = first_frame.gsub(%r{https?://[^/]+}, "").gsub(/-[A-Za-z0-9_]{8}\.js/, ".js").gsub(/:\d+(:\d+)?/, "")
    Digest::SHA256.hexdigest([message.to_s.gsub(/\d+/, "#"), place.strip].join("\n")).first(32)
  end
end
