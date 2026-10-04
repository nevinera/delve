// An ability icon image, tinted when the ability gives an iconColor (see
// docs/schema/ability.md). Stock icons are white silhouettes, so the tint
// draws the image as a mask filled with the color; without one the image
// shows as-is, so full-color custom icons keep their colors.
export function iconTint(color) {
  if (!color) return null;
  return color.startsWith("#") ? color : `#${color}`;
}

export default function IconImage({src, color, alt, className, style, onClick}) {
  const tint = iconTint(color);
  if (!tint) return <img src={src} alt={alt} className={className} style={style} onClick={onClick} />;

  const mask = `url("${src.replace(/["\\]/g, "\\$&")}") center / contain no-repeat`;
  return (
    <div
      role="img"
      aria-label={alt}
      className={className}
      onClick={onClick}
      style={{...style, backgroundColor: tint, WebkitMask: mask, mask}}
    />
  );
}
