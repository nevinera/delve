require "open3"

module Worlds
  # Lists a world directory or zip's files (script/manifest.mjs): { path => { "sha", "size" } }.
  class Manifest
    class Failed < StandardError; end

    SCRIPT = Rails.root.join("script/manifest.mjs").to_s

    def self.call(path)
      out, err, status = Open3.capture3("node", SCRIPT, path.to_s, chdir: Rails.root.to_s)
      raise Failed, (err.presence || "the manifest script exited with #{status.exitstatus}").strip unless status.success?
      JSON.parse(out)
    end
  end
end
