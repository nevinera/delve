# Runs the block with some environment variables set (nil unsets one), putting them back after.
module WithEnv
  def with_env(vars)
    saved = vars.keys.to_h { |k| [k, ENV[k]] }
    vars.each { |k, v| ENV[k] = v }
    yield
  ensure
    saved.each { |k, v| ENV[k] = v }
  end
end

RSpec.configure { |config| config.include WithEnv }
