# frozen_string_literal: true

module Bot
  module Strategies
    # Walks to a point on the bot's current map, around its barriers (see
    # Pathfinder), stopping within stop_within feet of it. Config:
    # {"x": 120, "y": 340, "stop_within": 1, "then": "stop"}; with "then":
    # "quit", the run ends on arrival. It replans when it stops making
    # progress, and quits (saying why) when there's no route, it keeps
    # getting stuck, or it leaves the map.
    class Goto < Strategy
      CLEARANCE_MARGIN = 0.5 # feet of room beyond the bot's own radius
      WAYPOINT_REACH = 3.0 # feet from a waypoint to move on to the next
      STUCK_SECONDS = 2.0
      STUCK_FEET = 1.0
      REPLANS = 3
      ARRIVAL_SLACK = 3.0 # feet past stop_within that still counts as there, once stopped

      def initialize(config = {})
        super
        @target = %w[x y].map { |k| Float(config.fetch(k)) }
        @stop_within = Float(config.fetch("stop_within", 1))
        @then = config.fetch("then", "stop")
        raise ConfigError, %(then must be "stop" or "quit") unless %w[stop quit].include?(@then)
      rescue KeyError, ArgumentError, TypeError
        raise ConfigError, "goto needs numeric x and y (and stop_within, if given)"
      end

      def tick(state, controls, now)
        return if @done || !(me = state.me)
        @map ||= me["map_identifier"]
        return finish(controls, "left the map") unless me["map_identifier"] == @map
        return arrive(controls) if arrived?(me, controls)
        follow_route(state, me, controls, now)
      end

      private

      # Stopped on the last leg, near the target (the goal can also be
      # cleared by something else steering, such as a Brawler wrapping this).
      def arrived?(me, controls)
        @heading && controls.goal.nil? && distance(me["position"].values_at("x", "y"), @target) <= @stop_within + ARRIVAL_SLACK
      end

      def follow_route(state, me, controls, now)
        at = me["position"].values_at("x", "y")
        return unless check_progress(at, now, controls) && (@route ||= plan(state, me, at, controls))
        walk(at, controls)
      end

      def plan(state, me, at, controls)
        finder = state.pathfinder(@map, clearance: me["radius"].to_f + CLEARANCE_MARGIN)
        finder&.path(at, @target) || finish(controls, "no route to (#{@target.join(", ")}) on #{@map}")
      end

      def walk(at, controls)
        @route.shift while @route.size > 1 && distance(at, @route.first) <= WAYPOINT_REACH
        @heading = @route.size == 1
        controls.move_toward(*@route.first, @heading ? @stop_within : 0)
      end

      # Replans (dropping the route) when the bot has barely moved for a
      # while, and gives up after a few tries; false once given up.
      def check_progress(at, now, controls)
        if @progress.nil? || distance(at, @progress[:at]) >= STUCK_FEET
          @progress = {at:, since: now, replans: 0}
        elsif now - @progress[:since] >= STUCK_SECONDS
          return finish(controls, "stuck at (#{at.map(&:round).join(", ")})") if (@progress[:replans] += 1) > REPLANS
          @progress[:since] = now
          @route = nil
        end
        true
      end

      def arrive(controls)
        @done = true
        controls.stop
        controls.quit("arrived at (#{@target.join(", ")})") if @then == "quit"
      end

      def finish(controls, reason)
        @done = true
        controls.stop
        controls.quit(reason)
        false
      end

      def distance(a, b) = Math.hypot(a[0] - b[0], a[1] - b[1])
    end
  end
end
