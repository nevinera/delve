module Content
  class Effect
    # The nested "status" object (name/treatAs/stacking/maxStacks/effects,
    # see Validators::StatusValidator) isn't modeled yet - it's carried
    # through as a raw hash until we build editing for status effects.
    class Status < Effect
      attribute :affects, :string
      attribute :duration, :float
      attribute :range_min, :float
      attribute :range_max, :float
      attribute :status, default: -> { {} }

      validates :affects, inclusion: {in: AFFECTS_OPTIONS}
      validates :duration, presence: true, numericality: true
      validates :range_min, :range_max, presence: true, unless: -> { affects == "self" }

      def self.build_from_h(hash)
        range = FloatOrRange.from_value(hash["range"])
        new(
          affects: hash["affects"],
          duration: hash["duration"],
          range_min: range&.min, range_max: range&.max,
          status: hash["status"] || {},
          tags: hash["tags"] || []
        )
      end

      def range
        (range_min && range_max) ? FloatOrRange.new(min: range_min, max: range_max) : nil
      end

      def to_h
        fields = super.merge("affects" => affects, "duration" => duration, "status" => status)
        fields["range"] = range.to_value if range
        fields
      end
    end
  end
end
