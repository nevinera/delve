module Validators
  # A map's connections against its fill (see MapFill): every line
  # connection sits on the edge of the playable area - open ground on one
  # side, the fill or the map's edge on the other - and every point
  # connection on open ground. Fill on both sides of a line usually means
  # the walls around the playable area leak. Runs after MapValidator has
  # checked the map's shape.
  class MapFillValidator < Base
    def validate!(data, path: "$")
      connections = Array(data["connections"])
      return if connections.empty?
      @fill = MapFill.call(data)
      connections.each_with_index { |conn, i| validate_connection!(conn, path: index_path(child_path(path, "connections"), i)) }
    end

    private

    def validate_connection!(conn, path:)
      case conn["type"]
      when "line" then validate_line_sides!(conn, path: path)
      when "point" then validate_point_ground!(conn, path: path)
      end
    end

    def validate_line_sides!(conn, path:)
      bad = line_pieces(conn).find { |piece| [piece.left, piece.right].count(:open) != 1 }
      return unless bad
      raise ValidationError.new("line connection #{conn["identifier"]} must have open ground on exactly one side, but has #{side_problem(bad)}", path: path)
    end

    def line_pieces(conn) = @fill.edges.select { |e| e.kind == :connection && e.identifier == conn["identifier"] }

    def side_problem(piece)
      return "open ground on both sides" if [piece.left, piece.right].include?(:open)
      "fill on both sides - the walls around the playable area may leak"
    end

    def validate_point_ground!(conn, path:)
      position = conn["position"]
      return unless @fill.state_at([position["x"].to_f, position["y"].to_f]) == :filled
      raise ValidationError.new("point connection #{conn["identifier"]} is in the fill, where nobody can stand", path: child_path(path, "position"))
    end
  end
end
