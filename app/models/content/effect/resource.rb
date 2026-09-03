module Content
  class Effect
    class Resource < Effect
      attribute :affects, :string
      attribute :resource_name, :string
      attribute :delta, :float
      attribute :range_min, :float
      attribute :range_max, :float

      validates :affects, inclusion: {in: AFFECTS_OPTIONS}
      validates :resource_name, presence: true
      validates :delta, presence: true, numericality: true
      validates :range_min, :range_max, presence: true, unless: -> { affects == "self" }

      def self.build_from_h(hash)
        range = FloatOrRange.from_value(hash["range"])
        new(
          affects: hash["affects"],
          resource_name: hash["resourceName"],
          delta: hash["delta"],
          range_min: range&.min, range_max: range&.max,
          tags: hash["tags"] || []
        )
      end

      def range
        (range_min && range_max) ? FloatOrRange.new(min: range_min, max: range_max) : nil
      end

      def to_h
        fields = super.merge("affects" => affects, "resourceName" => resource_name, "delta" => delta)
        fields["range"] = range.to_value if range
        fields
      end
    end
  end
end
