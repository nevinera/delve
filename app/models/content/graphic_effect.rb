module Content
  class GraphicEffect
    include ActiveModel::Model
    include ActiveModel::Attributes

    ORIGIN_OPTIONS = Validators::GraphicEffectValidator::ORIGIN_OPTIONS
    WHEN_OPTIONS = Validators::GraphicEffectValidator::WHEN_OPTIONS
    CONDITION_OPTIONS = Validators::GraphicEffectValidator::CONDITION_OPTIONS

    attribute :source_url, :string
    attribute :duration, :float
    attribute :from, :string
    attribute :to, :string
    attribute :when, :string
    attribute :condition, :string
    attribute :color, :string
    attribute :scale, :float
    attribute :sprite_columns, :integer
    attribute :sprite_rows, :integer
    attribute :sprite_frame_count, :integer
    attribute :sprite_frame_rate, :float

    validates :source_url, presence: true
    validates :duration, presence: true, numericality: true
    validates :from, inclusion: {in: ORIGIN_OPTIONS}
    validates :to, inclusion: {in: ORIGIN_OPTIONS}, allow_nil: true
    validates :when, inclusion: {in: WHEN_OPTIONS}
    validates :condition, inclusion: {in: CONDITION_OPTIONS}
    validates :sprite_rows, presence: true, if: -> { sprite_columns.present? }
    validates :sprite_columns, presence: true, if: -> { sprite_rows.present? }

    def self.from_h(hash)
      new(
        source_url: hash["sourceURL"],
        duration: hash["duration"],
        from: hash["from"],
        to: hash["to"],
        when: hash["when"],
        condition: hash["condition"],
        color: hash["color"],
        scale: hash["scale"],
        sprite_columns: hash["spriteColumns"],
        sprite_rows: hash["spriteRows"],
        sprite_frame_count: hash["spriteFrameCount"],
        sprite_frame_rate: hash["spriteFrameRate"]
      )
    end

    def to_h
      {
        "sourceURL" => source_url,
        "duration" => duration,
        "from" => from,
        "to" => to,
        "when" => self.when,
        "condition" => condition,
        "color" => color,
        "scale" => scale,
        "spriteColumns" => sprite_columns,
        "spriteRows" => sprite_rows,
        "spriteFrameCount" => sprite_frame_count,
        "spriteFrameRate" => sprite_frame_rate
      }.compact
    end
  end
end
