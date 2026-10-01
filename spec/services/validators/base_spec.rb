require "rails_helper"

RSpec.describe Validators::Base do
  it "requires subclasses to implement validate!" do
    expect { Class.new(described_class).validate!({}) }.to raise_error(NotImplementedError, /must implement #validate!/)
  end
end
