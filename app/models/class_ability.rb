class ClassAbility < ApplicationRecord
  belongs_to :character_class

  validates :name, presence: true
  validates :position, presence: true, numericality: {only_integer: true, greater_than_or_equal_to: 0},
    uniqueness: {scope: :character_class_id}

  # A short one-line summary of cost and timing, e.g.
  # "30 energy · Instant · 1.5s GCD · 3s cooldown · 5 range".
  def stat_summary
    [cost_summary, cast_summary, *timing_summaries].compact.join(" · ")
  end

  # icon_url for a CSS url(), or nil if it has characters that could break
  # out of one.
  def icon_mask_url
    icon_url if icon_url.present? && !icon_url.match?(/["'()\\\s]/)
  end

  # The ability's iconColor (see docs/schema/ability.md) as a CSS color,
  # or nil when it gives none.
  def icon_color
    color = source_json&.dig("iconColor")
    return unless color.is_a?(String) && Validators::Helpers::HEX_COLOR_RE.match?(color)
    color.start_with?("#") ? color : "##{color}"
  end

  private

  def cost_summary
    "#{format_number(cost_amount)} #{cost_type}" if cost_type.present? && cost_amount.present?
  end

  def cast_summary
    cast_time.present? ? "#{format_number(cast_time)}s cast" : "Instant"
  end

  def timing_summaries
    [[global_cooldown, "s GCD"], [cooldown, "s cooldown"], [max_range, " range"]]
      .map { |value, suffix| "#{format_number(value)}#{suffix}" unless value.nil? }
  end

  def format_number(value)
    (value % 1).zero? ? value.to_i.to_s : value.to_s
  end
end
