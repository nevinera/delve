# Resolves a client/ build entry (see vite.config.js's rollupOptions.input)
# to its current content-hashed filename via public/client/.vite/manifest.json,
# so layouts don't hardcode a stable filename that could serve stale content
# indefinitely under the long Cache-Control on public/ (see
# config/environments/production.rb).
module ViteHelper
  VITE_MANIFEST_PATH = Rails.root.join("public/client/.vite/manifest.json")

  # entry_key matches vite.config.js's input paths as vite reports them in
  # the manifest, e.g. "src/main.jsx" for `main: resolve(__dirname,
  # "client/src/main.jsx")` (root: "client"). fallback_src is the plain
  # unhashed path (e.g. "/client/main.js"), used if the manifest is missing
  # - only expected when `manifest: true` was removed from vite.config.js,
  # or the build hasn't run yet.
  def vite_script_tags(entry_key, fallback_src)
    entry = vite_manifest[entry_key]
    return %(<script type="module" src="#{fallback_src}"></script>).html_safe unless entry

    preloads = (entry["imports"] || []).filter_map { |key| vite_manifest[key] }.map do |chunk|
      %(<link rel="modulepreload" href="/client/#{chunk["file"]}">)
    end
    script = %(<script type="module" src="/client/#{entry["file"]}"></script>)
    safe_join((preloads + [script]).map(&:html_safe), "\n")
  end

  private

  def vite_manifest
    @vite_manifest ||= File.exist?(VITE_MANIFEST_PATH) ? JSON.parse(File.read(VITE_MANIFEST_PATH)) : {}
  end
end
