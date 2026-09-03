module Content
  # Server-hosted assets under public/abilities/{icons,graphics,sounds} that
  # content authors can reference with a ":name:" sourceURL/iconURL, instead
  # of a relative path into their own repo (see docs/schema/ability.md,
  # Validators::AbilityValidator, GraphicEffectValidator, SoundEffectValidator).
  # This is the single source of truth: the client editor gets this same data
  # injected as a JS constant (see Build::BaseController#stock_assets_json)
  # rather than maintaining its own copy.
  #
  # spriteColumns/spriteRows are only given for animated graphics - a bare
  # {"file" => ...} entry is a single static image. spriteFrameCount isn't
  # specified per-asset since GraphicEffect already defaults it sensibly
  # (full grid - see docs/schema/graphic_effect.md). spriteFrameRate is only
  # given where it's already established elsewhere (see below); otherwise it
  # falls back to GraphicEffect's own default (8fps).
  module StockAssets
    ICONS = {
      "heal" => {"file" => "heal.svg"},
      "magic-ball" => {"file" => "magic-ball.svg"}
    }.freeze

    # spriteFrameRate: 12 for sword-swing/spinning-arrow/magic-ball matches
    # the values already hand-tuned for these exact sprites in App.jsx's
    # hardcoded basic-attack powers (NPC_BASIC_ATTACK_POWER etc.) - not a
    # guess, an existing precedent.
    GRAPHICS = {
      "arc" => {"file" => "arc.webp"},
      "claw-slash" => {"file" => "claw-slash.png"},
      "glow" => {"file" => "glow.png"},
      "helix-beam" => {"file" => "helix-beam.sprites1x3.png", "spriteColumns" => 1, "spriteRows" => 3},
      "magic-ball" => {"file" => "magic-ball.sprites3x3.png", "spriteColumns" => 3, "spriteRows" => 3, "spriteFrameRate" => 12},
      "mist" => {"file" => "mist.png"},
      "radial-burst" => {"file" => "radial-burst.png"},
      "ring-burst" => {"file" => "ring-burst.png"},
      "rotating-beam" => {"file" => "rotating-beam.sprites3x4.png", "spriteColumns" => 3, "spriteRows" => 4},
      "shards" => {"file" => "shards.sprites7x1.png", "spriteColumns" => 7, "spriteRows" => 1},
      "shield-spark" => {"file" => "shield-spark.png"},
      # filename says "sprites5x1" but the actual grid is 2x3 (32x32 cells,
      # matching every other stock sprite) with only 5 of the 6 cells used.
      "sparkle-cloud" => {"file" => "sparkle-cloud.sprites5x1.png", "spriteColumns" => 2, "spriteRows" => 3, "spriteFrameCount" => 5},
      "spinning-arrow" => {"file" => "spinning-arrow.sprites2x4.png", "spriteColumns" => 2, "spriteRows" => 4, "spriteFrameRate" => 12},
      "splat" => {"file" => "splat.png"},
      "sword-swing" => {"file" => "sword-swing.sprites3x3.png", "spriteColumns" => 3, "spriteRows" => 3, "spriteFrameRate" => 12},
      "tendrils" => {"file" => "tendrils.sprites5x1.png", "spriteColumns" => 5, "spriteRows" => 1}
    }.freeze

    # duration is the measured length of the audio file itself, in seconds -
    # except thud (established at 0.12s, a deliberate truncation of the
    # 1.2s file for a punchier hit sound) and whoomph (established at 1.8s,
    # ~the file's measured 1.795s), both matching the existing hand-tuned
    # values in App.jsx's hardcoded basic-attack powers.
    SOUNDS = {
      "boom" => {"file" => "boom.ogg", "duration" => 0.2},
      "chime" => {"file" => "chime.ogg", "duration" => 0.104},
      "clang" => {"file" => "clang.ogg", "duration" => 0.401},
      "crack" => {"file" => "crack.ogg", "duration" => 0.138},
      "crackle" => {"file" => "crackle.loop.ogg", "duration" => 2.444},
      "crunch" => {"file" => "crunch.ogg", "duration" => 0.401},
      "displace" => {"file" => "displace.ogg", "duration" => 0.12},
      "hum" => {"file" => "hum.loop.ogg", "duration" => 2.995},
      "poof" => {"file" => "poof.ogg", "duration" => 0.331},
      "slash" => {"file" => "slash.ogg", "duration" => 0.325},
      "squelch" => {"file" => "squelch.ogg", "duration" => 0.2},
      "thud" => {"file" => "thud.ogg", "duration" => 0.12},
      "twang" => {"file" => "twang.ogg", "duration" => 0.12},
      "whoomph" => {"file" => "whoomph.ogg", "duration" => 1.8},
      "whoosh" => {"file" => "whoosh.ogg", "duration" => 0.3},
      "zap" => {"file" => "zap.ogg", "duration" => 0.232}
    }.freeze

    def self.icon?(name)
      ICONS.key?(name)
    end

    def self.graphic?(name)
      GRAPHICS.key?(name)
    end

    def self.sound?(name)
      SOUNDS.key?(name)
    end

    # Shape injected into the ability editor page for the client's stock-asset
    # pulldowns (see Build::AbilitiesController#edit) - "file" becomes a
    # public URL, since the client only needs to point an <img>/<audio> at it.
    def self.client_json
      {
        icons: with_urls(ICONS, "icons"),
        graphics: with_urls(GRAPHICS, "graphics"),
        sounds: with_urls(SOUNDS, "sounds")
      }
    end

    def self.with_urls(entries, dir)
      entries.transform_values { |meta| meta.except("file").merge("url" => "/abilities/#{dir}/#{meta.fetch("file")}") }
    end
    private_class_method :with_urls
  end
end
