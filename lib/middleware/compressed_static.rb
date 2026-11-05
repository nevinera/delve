# Serves public/ as ActionDispatch::Static does, sending the build's .br and .gz copies
# (vite.config.js) to browsers that take them, for JSON and WebAssembly too, which Rails leaves
# out by default.
class CompressedStatic < ActionDispatch::Static
  TYPES = %r{\A(?:text/|application/(?:javascript|json|wasm)|image/svg\+xml)}

  def initialize(app, path, index: "index", headers: {})
    super
    @file_handler = ActionDispatch::FileHandler.new(path, index:, headers:, compressible_content_types: TYPES)
  end
end
