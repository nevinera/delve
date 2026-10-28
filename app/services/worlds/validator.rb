require "open3"

module Worlds
  # Runs the world validator (script/validate.mjs) on a world directory or zip. Returns
  # { "problems" => [...], "files" => { path => { "sha", "size" } } }.
  class Validator
    class Failed < StandardError; end

    SCRIPT = Rails.root.join("script/validate.mjs").to_s

    def self.call(path)
      out, err, status = Open3.capture3("node", SCRIPT, "--manifest", path.to_s, chdir: Rails.root.to_s)
      # 0: no problems; 1: problems found. Anything else means it couldn't check the world.
      raise Failed, (err.presence || "the validator exited with #{status.exitstatus}").strip unless [0, 1].include?(status.exitstatus)
      JSON.parse(out)
    end
  end
end
