# A local content server (e.g. `python3 -m http.server 8001` in the content
# repo) that zones can be played from directly, without GitHub - see
# Build::ZonePlaysController. Defaults to localhost:8001 in development;
# unset (feature off) elsewhere unless LOCAL_CONTENT_URL is given.
Rails.application.config.x.local_content_url =
  ENV.fetch("LOCAL_CONTENT_URL") { Rails.env.development? ? "http://localhost:8001" : nil }&.chomp("/").presence
