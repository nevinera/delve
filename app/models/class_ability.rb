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
