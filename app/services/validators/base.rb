module Validators
  class Base
    include Helpers

    def self.validate!(data, path: "$")
      new.validate!(data, path: path)
    end

    def validate!(data, path: "$")
      raise NotImplementedError, "#{self.class} must implement #validate!"
    end
  end
end
