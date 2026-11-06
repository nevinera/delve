# One measurement a page sent (client/src/metrics/metrics.js): how long something took (a timing,
# in milliseconds), how many of something (a count), or a level (a gauge). Tags say where it's
# from, such as the page, build and whether it's a phone. Kept KEEP_DAYS.
class Metric < MetricsRecord
  KINDS = %w[timing count gauge].freeze
  KEEP_DAYS = 30
  MOST_AT_ONCE = 100 # a batch keeps no more than this
  NAME = /\A[a-z0-9_.]{1,80}\z/
  TAG_CHARS = 200

  validates :name, format: {with: NAME}
  validates :kind, inclusion: {in: KINDS}
  validates :value, numericality: true

  # Keeps a page's batch, [{ name, kind, value, tags, at }], leaving out what doesn't make sense.
  # `at` is how long before sending, in milliseconds, it was measured.
  def self.record_batch!(batch, user:, tags: {}, now: Time.current)
    rows = Array(batch).first(MOST_AT_ONCE).filter_map do |m|
      next unless m.is_a?(Hash) && m["name"].to_s.match?(NAME) && KINDS.include?(m["kind"]) && finite?(m["value"])
      ago = m["at"].is_a?(Numeric) ? m["at"].clamp(0, 1.day.in_milliseconds) : 0
      {name: m["name"], kind: m["kind"], value: m["value"].to_f, tags: clean(tags.merge(m["tags"].is_a?(Hash) ? m["tags"] : {})), user_id: user&.id, recorded_at: now - ago / 1000.0}
    end
    insert_all(rows) if rows.any?
    prune(now) if rand < 0.02
    rows.size
  end

  def self.prune(now = Time.current)
    where(recorded_at: ...now - KEEP_DAYS.days).delete_all
  end

  # For each name, since then: how many, and the 50th and 95th percentiles and the most, split by
  # a tag if one's named.
  def self.summary(since: 1.day.ago, by: nil, name: nil)
    scope = where(recorded_at: since..)
    scope = scope.where("name LIKE ?", "#{sanitize_sql_like(name)}%") if name
    scope.pluck(:name, :value, :tags).group_by { |n, _, tags| [n, by && tags[by.to_s]] }.sort_by(&:first).map do |(n, tag), rows|
      values = rows.map { |_, v, _| v }.sort
      row = {name: n, count: values.size, p50: percentile(values, 0.5), p95: percentile(values, 0.95), max: values.last}
      by ? row.merge(by => tag) : row
    end
  end

  def self.percentile(sorted, share) = sorted[((sorted.size - 1) * share).round]

  def self.finite?(value) = value.is_a?(Numeric) && value.to_f.finite?

  def self.clean(tags)
    tags.first(10).to_h { |k, v| [k.to_s[0, 40], v.to_s[0, TAG_CHARS]] }
  end
  private_class_method :finite?, :clean
end
