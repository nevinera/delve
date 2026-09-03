module Content
  # Wraps a value that may be a single float or a [min, max] range in the
  # underlying JSON (see Validators::Helpers#validate_float_or_range!).
  # Always holds min/max internally so it can back two range inputs in a
  # form; collapses back to a scalar on #to_value when min == max.
  class FloatOrRange
    include ActiveModel::Model
    include ActiveModel::Attributes

    attribute :min, :float
    attribute :max, :float

    validates :min, :max, presence: true

    def self.from_value(value)
      return nil if value.nil?
      value.is_a?(Array) ? new(min: value[0], max: value[1]) : new(min: value, max: value)
    end

    def ranged?
      min != max
    end

    def to_value
      ranged? ? [min, max] : min
    end
  end
end
