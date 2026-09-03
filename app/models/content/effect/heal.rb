module Content
  class Effect
    class Heal < Effect
      attribute :affects, :string
      attribute :amount_min, :float
      attribute :amount_max, :float
      attribute :range_min, :float
      attribute :range_max, :float

      validates :affects, inclusion: {in: AFFECTS_OPTIONS}
      validates :amount_min, :amount_max, presence: true
      validates :range_min, :range_max, presence: true, unless: -> { affects == "self" }

      def self.build_from_h(hash)
        amount = FloatOrRange.from_value(hash["amount"])
        range = FloatOrRange.from_value(hash["range"])
        new(
          affects: hash["affects"],
          amount_min: amount&.min, amount_max: amount&.max,
          range_min: range&.min, range_max: range&.max,
          tags: hash["tags"] || []
        )
      end

      def amount
        FloatOrRange.new(min: amount_min, max: amount_max)
      end

      def range
        (range_min && range_max) ? FloatOrRange.new(min: range_min, max: range_max) : nil
      end

      def to_h
        fields = super.merge("affects" => affects, "amount" => amount.to_value)
        fields["range"] = range.to_value if range
        fields
      end
    end
  end
end
