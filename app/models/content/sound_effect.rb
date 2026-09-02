module Content
  class SoundEffect
    include ActiveModel::Model
    include ActiveModel::Attributes

    LOCATION_OPTIONS = Validators::SoundEffectValidator::LOCATION_OPTIONS
    WHEN_OPTIONS = Validators::SoundEffectValidator::WHEN_OPTIONS
    CONDITION_OPTIONS = Validators::SoundEffectValidator::CONDITION_OPTIONS
    IMPACT_TIMING_OPTIONS = Validators::SoundEffectValidator::IMPACT_TIMING_OPTIONS

    attribute :source_url, :string
    attribute :duration, :float
    attribute :location, :string
    attribute :when, :string
    attribute :condition, :string
    attribute :impact_timing, :string
    attribute :volume_scale, :float

    validates :source_url, presence: true
    validates :duration, presence: true, numericality: true
    validates :location, inclusion: {in: LOCATION_OPTIONS}
    validates :when, inclusion: {in: WHEN_OPTIONS}
    validates :condition, inclusion: {in: CONDITION_OPTIONS}
    validates :impact_timing, inclusion: {in: IMPACT_TIMING_OPTIONS}, allow_nil: true

    def self.from_h(hash)
      new(
        source_url: hash["sourceURL"],
        duration: hash["duration"],
        location: hash["location"],
        when: hash["when"],
        condition: hash["condition"],
        impact_timing: hash["impactTiming"],
        volume_scale: hash["volumeScale"]
      )
    end

    def to_h
      {
        "sourceURL" => source_url,
        "duration" => duration,
        "location" => location,
        "when" => self.when,
        "condition" => condition,
        "impactTiming" => impact_timing,
        "volumeScale" => volume_scale
      }.compact
    end
  end
end
