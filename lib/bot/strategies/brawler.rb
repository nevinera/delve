# frozen_string_literal: true

module Bot
  module Strategies
    # Fights any enemy that comes near, and otherwise does what another
    # strategy does. An enemy is a hostile unit, or anything attacking the
    # bot, within `reach` feet (edge to edge); it walks into basic-attack
    # range and swings until the enemy dies or gets away (twice `reach`).
    # When it dies it respawns (unless "respawn" is false). Config:
    #
    #   {"reach": 15, "respawn": true,
    #    "then": {"strategy": "goto", "config": {"x": 120, "y": 340}}}
    #
    # "then" defaults to standing still.
    class Brawler < Strategy
      ATTACK_RANGE = 5.0 # feet between token edges, as the server's
      CLOSE_IN = 1.0 # how much nearer than ATTACK_RANGE to stop
      SWING_SECONDS = 2.0 # the nominal swing interval, as the browser client assumes until the server says otherwise
      RESPAWN_SECONDS = 2.0
      UNTARGETABLE = %w[dead respawning leashing].freeze

      def initialize(config = {})
        super
        @reach = Float(config.fetch("reach", 15))
        @respawn = config.fetch("respawn", true) != false
        @inner = inner_strategy(config.fetch("then", {"strategy" => "null"}))
      rescue ArgumentError, TypeError
        raise ConfigError, "reach must be a number of feet"
      end

      def tick(state, controls, now)
        me = state.me or return
        return dead(controls, now) if me["status"] == "dead"
        enemy = pick_enemy(state, me, controls)
        return fight(state, me, enemy, controls, now) if enemy
        stand_down(controls) if controls.attacking
        @inner.tick(state, controls, now)
      end

      def on_message(msg) = @inner.on_message(msg)

      private

      def inner_strategy(spec)
        raise ConfigError, %(then must be {"strategy": name, "config": {...}}) unless spec.is_a?(Hash) && spec["strategy"]
        Strategies.build(spec["strategy"], spec.fetch("config", {}))
      end

      # Keeps fighting the current enemy while it's in reach (doubled),
      # else the nearest enemy in reach.
      def pick_enemy(state, me, controls)
        current = controls.attacking && state.units[controls.attacking]
        return current if current && enemy?(state, me, current, @reach * 2)
        state.units_within(@reach).find { |unit| enemy?(state, me, unit, @reach) }
      end

      def enemy?(state, me, unit, reach)
        return false if UNTARGETABLE.include?(unit["status"])
        return false unless (distance = state.distance(me, unit)) && distance <= reach
        unit["hostility"] == "hostile" || unit["target"] == state.units.key(me)
      end

      def fight(state, me, enemy, controls, now)
        controls.attack(state.units.key(enemy))
        close_in(me, enemy, controls)
        swing(state, me, enemy, controls, now)
      end

      # move_toward stops on center distance: the range plus both radii.
      def close_in(me, enemy, controls)
        pos = enemy["position"]
        controls.move_toward(pos["x"], pos["y"], ATTACK_RANGE - CLOSE_IN + me["radius"].to_f + enemy["radius"].to_f)
      end

      def swing(state, me, enemy, controls, now)
        return unless state.distance(me, enemy) <= ATTACK_RANGE && ready_to_swing?(me, now)
        controls.basic_attack
        @last_swing = now
        @swung_at_ms = Time.now.to_f * 1000
      end

      # After a swing, waits out the nominal interval, or the server's own
      # next_basic_attack_at once it reports a newer one (haste shortens it).
      def ready_to_swing?(me, now)
        server_next = me["next_basic_attack_at"].to_i
        return server_next <= Time.now.to_f * 1000 if @last_swing.nil? || server_next > @swung_at_ms
        now - @last_swing >= SWING_SECONDS
      end

      # The fight's over: stop chasing where the enemy was.
      def stand_down(controls)
        controls.stop_attacking
        controls.stop
      end

      def dead(controls, now)
        controls.stop_attacking
        controls.stop
        return if !@respawn || (@last_respawn && now - @last_respawn < RESPAWN_SECONDS)
        controls.respawn
        @last_respawn = now
      end
    end
  end
end
