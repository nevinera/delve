module Validators
  class ValidationError < StandardError
    attr_reader :path

    def initialize(message, path: "$")
      @path = path
      super("#{message} (at #{path})")
    end
  end
end
