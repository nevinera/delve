module Build::AbilitiesHelper
  def scalar_fields(hash)
    hash.reject { |_, value| value.is_a?(Array) }
  end

  def list_fields(hash)
    hash.select { |_, value| value.is_a?(Array) }
  end

  def field_label(key)
    key.to_s.underscore.humanize
  end

  def entry_summary(entry, index)
    hint = entry["type"] || entry["when"]
    hint ? "#{index + 1}. #{hint}" : (index + 1).to_s
  end

  def format_value(value)
    case value
    when nil then "—"
    when true, false then value.to_s
    when Array then value.map { |v| format_value(v) }.join(", ")
    when Hash then safe_join(value.map { |k, v| "#{field_label(k)}: #{format_value(v)}" }, "; ")
    else value.to_s
    end
  end
end
