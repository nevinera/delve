# Every level that takes `annotations` (see Validators::AnnotationsValidator)
# checks them the same way. Give `annotatable`, a valid document.
RSpec.shared_examples "annotatable" do
  it "accepts annotations" do
    data = annotatable.merge("annotations" => {"plan" => "A quiet place.", "mood" => "safe"})
    expect { described_class.validate!(data) }.not_to raise_error
  end

  it "raises on a bad annotation, at its path" do
    data = annotatable.merge("annotations" => {"plan" => 3})
    expect { described_class.validate!(data) }
      .to raise_error(Validators::ValidationError, /must be a string/) { |e| expect(e.path).to eq("$.annotations.plan") }
  end
end
