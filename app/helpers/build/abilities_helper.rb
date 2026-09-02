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

  def asset_media_kind(key, value, thumbnails, entry = {})
    return nil unless key.to_s.end_with?("URL")
    data_uri = thumbnails[value]
    return nil unless data_uri
    return :sprite if key == "sourceURL" && entry["spriteColumns"].to_i > 0 && entry["spriteRows"].to_i > 0
    data_uri.start_with?("data:audio") ? :audio : :image
  end

  SpriteGeometry = Struct.new(:columns, :rows, :total_frames, :frame_rate)

  def sprite_preview_tag(data_uri, entry)
    geometry = sprite_geometry(entry)
    anim_name = "sprite-#{SecureRandom.hex(4)}"

    safe_join([
      content_tag(:style, sprite_css(anim_name, data_uri, geometry).html_safe),
      content_tag(:div, "", class: "asset-thumbnail #{anim_name}")
    ])
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

  private

  def sprite_geometry(entry)
    columns = entry["spriteColumns"].to_i
    rows = entry["spriteRows"].to_i
    total_frames = [entry["spriteFrameCount"].to_i, columns * rows].max
    SpriteGeometry.new(columns, rows, total_frames, sprite_frame_rate(entry, total_frames))
  end

  def sprite_frame_rate(entry, total_frames)
    rate = entry["spriteFrameRate"]
    return rate.to_f if rate.to_f > 0

    duration = entry["duration"]
    duration = 1.0 unless duration.is_a?(Numeric) && duration > 0
    total_frames / duration
  end

  def sprite_css(anim_name, data_uri, geometry)
    loop_seconds = (geometry.total_frames / geometry.frame_rate).round(2)
    <<~CSS
      @keyframes #{anim_name} { #{sprite_keyframes(geometry)} }
      .#{anim_name} {
        background-image: url('#{data_uri}');
        background-size: #{geometry.columns * 100}% #{geometry.rows * 100}%;
        background-repeat: no-repeat;
        animation: #{anim_name} #{loop_seconds}s steps(1) infinite;
      }
    CSS
  end

  def sprite_keyframes(geometry)
    (0...geometry.total_frames).map { |i| sprite_keyframe(i, geometry) }.join(" ")
  end

  def sprite_keyframe(index, geometry)
    row, column = index.divmod(geometry.columns)
    x = sprite_axis_percent(column, geometry.columns)
    y = sprite_axis_percent(row, geometry.rows)
    percent = (index * 100.0 / geometry.total_frames).round(2)
    "#{percent}% { background-position: #{x}% #{y}%; }"
  end

  def sprite_axis_percent(position, length)
    return 0 unless length > 1
    (position * 100.0 / (length - 1)).round(2)
  end
end
