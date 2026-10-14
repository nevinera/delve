require "rails_helper"

RSpec.describe ViteHelper, type: :helper do
  let(:manifest) do
    {
      "src/worldBuilder/main.jsx" => {"file" => "worldBuilder-abc.js", "isEntry" => true, "imports" => ["_shared-1.js"], "css" => ["worldBuilder-abc.css"]},
      "_shared-1.js" => {"file" => "shared-1.js", "imports" => ["_shared-2.js"], "css" => ["shared-1.css"]},
      "_shared-2.js" => {"file" => "shared-2.js", "imports" => ["_shared-1.js"]},
      "src/cellEditor/main.jsx" => {"file" => "cellEditor-def.js", "isEntry" => true}
    }
  end

  before { allow(helper).to receive(:vite_manifest).and_return(manifest) }

  describe "#vite_stylesheet_tags" do
    it "links the entry's CSS after its imported chunks'" do
      expect(helper.vite_stylesheet_tags("src/worldBuilder/main.jsx")).to eq(
        %(<link rel="stylesheet" href="/client/shared-1.css">\n<link rel="stylesheet" href="/client/worldBuilder-abc.css">)
      )
    end

    it "is empty for an entry with no CSS, or one the manifest doesn't have" do
      expect(helper.vite_stylesheet_tags("src/cellEditor/main.jsx")).to eq("")
      expect(helper.vite_stylesheet_tags("src/missing.jsx")).to eq("")
    end
  end

  describe "#vite_script_tags" do
    it "preloads the entry's chunks and loads its script" do
      expect(helper.vite_script_tags("src/worldBuilder/main.jsx", "/client/worldBuilder.js")).to eq(
        %(<link rel="modulepreload" href="/client/shared-1.js">\n<script type="module" src="/client/worldBuilder-abc.js"></script>)
      )
    end

    it "falls back to the unhashed path without a manifest entry" do
      expect(helper.vite_script_tags("src/missing.jsx", "/client/missing.js")).to eq(%(<script type="module" src="/client/missing.js"></script>))
    end
  end
end
