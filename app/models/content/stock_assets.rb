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
    # Every icon but magic-ball is from game-icons.net (CC BY 3.0, see
    # ATTRIBUTIONS.md): single-color white silhouettes, so they tint.
    ICONS = {
      "arcane" => {"file" => "arcane.svg"},
      "arrow" => {"file" => "arrow.svg"},
      "aura" => {"file" => "aura.svg"},
      "barrier" => {"file" => "barrier.svg"},
      "bleed" => {"file" => "bleed.svg"},
      "blink" => {"file" => "blink.svg"},
      "burn" => {"file" => "burn.svg"},
      "charge" => {"file" => "charge.svg"},
      "cleanse" => {"file" => "cleanse.svg"},
      "cleave" => {"file" => "cleave.svg"},
      "drain" => {"file" => "drain.svg"},
      "earth" => {"file" => "earth.svg"},
      "empower" => {"file" => "empower.svg"},
      "fear" => {"file" => "fear.svg"},
      "firebolt" => {"file" => "firebolt.svg"},
      "focus" => {"file" => "focus.svg"},
      "frost" => {"file" => "frost.svg"},
      "heal" => {"file" => "heal.svg"},
      "holy" => {"file" => "holy.svg"},
      "leap" => {"file" => "leap.svg"},
      "lightning" => {"file" => "lightning.svg"},
      "magic-ball" => {"file" => "magic-ball.svg"},
      "nature" => {"file" => "nature.svg"},
      "parry" => {"file" => "parry.svg"},
      "poison" => {"file" => "poison.svg"},
      "punch" => {"file" => "punch.svg"},
      "rage" => {"file" => "rage.svg"},
      "regen" => {"file" => "regen.svg"},
      "revive" => {"file" => "revive.svg"},
      "root" => {"file" => "root.svg"},
      "shadow" => {"file" => "shadow.svg"},
      "shield" => {"file" => "shield.svg"},
      "shield-bash" => {"file" => "shield-bash.svg"},
      "silence" => {"file" => "silence.svg"},
      "slash" => {"file" => "slash.svg"},
      "slow" => {"file" => "slow.svg"},
      "smash" => {"file" => "smash.svg"},
      "stab" => {"file" => "stab.svg"},
      "stealth" => {"file" => "stealth.svg"},
      "stun" => {"file" => "stun.svg"},
      "summon" => {"file" => "summon.svg"},
      "taunt" => {"file" => "taunt.svg"},
      "throw" => {"file" => "throw.svg"},
      "volley" => {"file" => "volley.svg"},
      "water" => {"file" => "water.svg"},
      "weaken" => {"file" => "weaken.svg"},
      "wind" => {"file" => "wind.svg"}
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
      "arcane" => {"file" => "arcane.ogg", "duration" => 2.475},
      "armor-up" => {"file" => "armor-up.ogg", "duration" => 0.507},
      "arrow-hit" => {"file" => "arrow-hit.ogg", "duration" => 0.786},
      "barrier" => {"file" => "barrier.ogg", "duration" => 2.429},
      "bell" => {"file" => "bell.ogg", "duration" => 1.747},
      "bite" => {"file" => "bite.ogg", "duration" => 1.637},
      "blade-hit" => {"file" => "blade-hit.ogg", "duration" => 1.044},
      "blade-scrape" => {"file" => "blade-scrape.ogg", "duration" => 0.534},
      "bloody-blade" => {"file" => "bloody-blade.ogg", "duration" => 0.869},
      "boom" => {"file" => "boom.ogg", "duration" => 0.2},
      "bubble" => {"file" => "bubble.ogg", "duration" => 0.7},
      "buff" => {"file" => "buff.ogg", "duration" => 1.611},
      "chains" => {"file" => "chains.ogg", "duration" => 0.505},
      "charge-up" => {"file" => "charge-up.ogg", "duration" => 1.116},
      "chime" => {"file" => "chime.ogg", "duration" => 0.104},
      "clang" => {"file" => "clang.ogg", "duration" => 0.401},
      "crack" => {"file" => "crack.ogg", "duration" => 0.138},
      "crackle" => {"file" => "crackle.loop.ogg", "duration" => 2.444},
      "crunch" => {"file" => "crunch.ogg", "duration" => 0.401},
      "dark" => {"file" => "dark.ogg", "duration" => 0.648},
      "dash" => {"file" => "dash.ogg", "duration" => 0.729},
      "debuff" => {"file" => "debuff.ogg", "duration" => 3.693},
      "displace" => {"file" => "displace.ogg", "duration" => 0.12},
      "fire-cast" => {"file" => "fire-cast.ogg", "duration" => 0.59},
      "fizzle" => {"file" => "fizzle.ogg", "duration" => 0.728},
      "hiss" => {"file" => "hiss.ogg", "duration" => 1.006},
      "holy" => {"file" => "holy.ogg", "duration" => 1.506},
      "hum" => {"file" => "hum.loop.ogg", "duration" => 2.995},
      "ice-cast" => {"file" => "ice-cast.ogg", "duration" => 1.17},
      "magic-hit" => {"file" => "magic-hit.ogg", "duration" => 2.198},
      "parry" => {"file" => "parry.ogg", "duration" => 0.931},
      "poof" => {"file" => "poof.ogg", "duration" => 0.331},
      "portal" => {"file" => "portal.ogg", "duration" => 1.168},
      "potion" => {"file" => "potion.ogg", "duration" => 0.675},
      "punch-hit" => {"file" => "punch-hit.ogg", "duration" => 0.823},
      "roar" => {"file" => "roar.ogg", "duration" => 1.15},
      "rock-hit" => {"file" => "rock-hit.ogg", "duration" => 0.636},
      "root" => {"file" => "root.ogg", "duration" => 1.703},
      "rumble" => {"file" => "rumble.ogg", "duration" => 3.517},
      "shatter" => {"file" => "shatter.ogg", "duration" => 0.918},
      "shield-block" => {"file" => "shield-block.ogg", "duration" => 0.501},
      "shout" => {"file" => "shout.ogg", "duration" => 1.157},
      "slash" => {"file" => "slash.ogg", "duration" => 0.325},
      "splash" => {"file" => "splash.ogg", "duration" => 0.506},
      "squelch" => {"file" => "squelch.ogg", "duration" => 0.2},
      "stab" => {"file" => "stab.ogg", "duration" => 1.58},
      "stun" => {"file" => "stun.ogg", "duration" => 1.602},
      "swing-heavy" => {"file" => "swing-heavy.ogg", "duration" => 0.775},
      "swing-light" => {"file" => "swing-light.ogg", "duration" => 0.7},
      "thud" => {"file" => "thud.ogg", "duration" => 0.12},
      "thunder" => {"file" => "thunder.ogg", "duration" => 1.607},
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

    def self.icon_url(name)
      file_url("icons", ICONS.fetch(name).fetch("file"))
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
      entries.transform_values { |meta| meta.except("file").merge("url" => file_url(dir, meta.fetch("file"))) }
    end
    private_class_method :with_urls

    def self.file_url(dir, file)
      "/abilities/#{dir}/#{file}"
    end
    private_class_method :file_url
  end
end
