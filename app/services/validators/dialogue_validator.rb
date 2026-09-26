module Validators
  # An NCU's `dialogue` (docs/schema/ncu.md#dialogue) - a branching tree of
  # nodes, keyed by opaque id, with a random-pick `entry` list. Split out of
  # NcuValidator since it needs its own reference-integrity pass over `nodes`
  # (every `entry`/`next`/`choices[].next` must resolve to a real node), same
  # reason UnitTacticsValidator is broken out of UnitTypeValidator.
  #
  # `entry` candidates and choices are objects (not bare strings) so a
  # future flag `condition`/`effects` field has somewhere to land without a
  # breaking shape change - see docs/schema/ncu.md.
  class DialogueValidator < Base
    def validate!(data, path: "$")
      require_object!(data, path: path)
      entry = require_array!(data, "entry", path: path, min: 1)
      nodes = require_nodes!(data, path: path)
      nodes.each { |id, node| validate_node!(node, path: child_path(child_path(path, "nodes"), id)) }
      validate_entry_references!(entry, nodes, path: path)
      nodes.each { |id, node| validate_node_references!(node, nodes, path: child_path(child_path(path, "nodes"), id)) }
    end

    private

    def require_nodes!(data, path:)
      nodes = require_hash!(data, "nodes", path: path)
      raise ValidationError.new("nodes must not be empty", path: child_path(path, "nodes")) if nodes.empty?
      nodes
    end

    def validate_entry_references!(entry, nodes, path:)
      entry_path = child_path(path, "entry")
      entry.each_with_index { |candidate, i| validate_entry_candidate!(candidate, nodes, path: index_path(entry_path, i)) }
    end

    # An entry candidate is its own object (not a bare node id string) so a
    # future flag condition has somewhere to live - see docs/schema/ncu.md.
    def validate_entry_candidate!(candidate, nodes, path:)
      require_object!(candidate, path: path)
      node_id = require_string!(candidate, "node", path: path)
      return if nodes.key?(node_id)
      raise ValidationError.new("entry references unknown node #{node_id.inspect}", path: child_path(path, "node"))
    end

    def validate_node!(node, path:)
      require_object!(node, path: path)
      text = require_string!(node, "text", path: path)
      raise ValidationError.new("text must not be empty", path: child_path(path, "text")) if text.strip.empty?
      validate_node_shape!(node, path: path)
    end

    def validate_node_shape!(node, path:)
      has_next = given?(node, "next")
      has_choices = given?(node, "choices")
      raise ValidationError.new("a node must not have both next and choices", path: path) if has_next && has_choices
      require_string!(node, "next", path: path) if has_next
      validate_choices!(node["choices"], path: child_path(path, "choices")) if has_choices
    end

    def validate_choices!(choices, path:)
      raise ValidationError.new("choices must be an array", path: path) unless choices.is_a?(Array)
      raise ValidationError.new("choices must have at least 1 element", path: path) if choices.empty?
      choices.each_with_index { |choice, i| validate_choice!(choice, path: index_path(path, i)) }
    end

    def validate_choice!(choice, path:)
      require_object!(choice, path: path)
      text = require_string!(choice, "text", path: path)
      raise ValidationError.new("text must not be empty", path: child_path(path, "text")) if text.strip.empty?
      next_id = require_string!(choice, "next", path: path)
      raise ValidationError.new("next must not be empty", path: child_path(path, "next")) if next_id.strip.empty?
    end

    def validate_node_references!(node, nodes, path:)
      if given?(node, "next")
        check_node_reference!(node["next"], nodes, path: child_path(path, "next"))
      elsif given?(node, "choices")
        choices_path = child_path(path, "choices")
        node["choices"].each_with_index do |choice, i|
          check_node_reference!(choice["next"], nodes, path: child_path(index_path(choices_path, i), "next"))
        end
      end
    end

    def check_node_reference!(id, nodes, path:)
      return if nodes.key?(id)
      raise ValidationError.new("references unknown node #{id.inspect}", path: path)
    end
  end
end
