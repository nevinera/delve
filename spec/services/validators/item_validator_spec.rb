require "rails_helper"

RSpec.describe Validators::ItemValidator, type: :validator do
  describe ".validate!" do
    let(:valid_item) do
      {
        "identifier" => "sword-of-doom",
        "name" => "Sword of Doom",
        "slot" => "main_hand",
        "weaponType" => "sword",
        "elvl" => 584,
        "primary" => "strength",
        "secondaries" => ["stamina", "crit_rating", "haste_rating"]
      }
    end

    it "accepts a fully-itemized item" do
      expect { described_class.validate!(valid_item) }.not_to raise_error
    end

    it "accepts an item with no primary and no secondaries" do
      data = valid_item.except("primary", "secondaries")
      expect { described_class.validate!(data) }.not_to raise_error
    end

    it "raises when identifier is missing" do
      expect { described_class.validate!(valid_item.except("identifier")) }
        .to raise_error(Validators::ValidationError, /identifier is required/)
    end

    it "raises when name is missing" do
      expect { described_class.validate!(valid_item.except("name")) }
        .to raise_error(Validators::ValidationError, /name is required/)
    end

    it "raises when slot is not a recognized value" do
      data = valid_item.merge("slot" => "trinket")
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /must be one of/)
    end

    it "raises when elvl is missing" do
      expect { described_class.validate!(valid_item.except("elvl")) }
        .to raise_error(Validators::ValidationError, /elvl is required/)
    end

    it "raises when elvl is negative" do
      data = valid_item.merge("elvl" => -1)
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /elvl must be at least 0/)
    end

    context "shield" do
      it "accepts shield: true on an off_hand item" do
        data = valid_item.except("weaponType").merge("slot" => "off_hand", "shield" => true, "primary" => nil)
        expect { described_class.validate!(data) }.not_to raise_error
      end

      it "raises when shield is true on a non-off_hand slot" do
        data = valid_item.merge("shield" => true)
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /shield is only valid when slot is off_hand/)
      end

      it "raises when shield is not a boolean" do
        data = valid_item.merge("slot" => "off_hand", "shield" => "yes")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /shield must be a boolean/)
      end

      it "raises when a shield item has a primary" do
        data = valid_item.except("weaponType").merge("slot" => "off_hand", "shield" => true)
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /primary must be null for this slot/)
      end
    end

    context "weaponType" do
      it "raises when weaponType is missing on a main_hand item" do
        data = valid_item.except("weaponType")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /weaponType is required for slot "main_hand"/)
      end

      it "raises for an unrecognized weaponType value" do
        data = valid_item.merge("weaponType" => "trinket")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /weaponType must be one of/)
      end

      it "raises when weaponType is set on a non-weapon slot" do
        data = valid_item.merge("slot" => "head", "weaponType" => "sword", "primary" => "strength")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /weaponType must be null for this slot/)
      end

      it "raises when weaponType is set on a shield" do
        data = valid_item.merge("slot" => "off_hand", "shield" => true, "primary" => nil, "weaponType" => "sword")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /weaponType must be null for this slot/)
      end

      it "accepts a null weaponType on a non-shield off_hand item (relic)" do
        data = valid_item.merge("slot" => "off_hand", "weaponType" => nil, "primary" => nil)
        expect { described_class.validate!(data) }.not_to raise_error
      end

      it "accepts a real weaponType on a non-shield off_hand item" do
        data = valid_item.merge("slot" => "off_hand", "weaponType" => "dagger")
        expect { described_class.validate!(data) }.not_to raise_error
      end

      it "accepts weaponType on a one_hand item" do
        data = valid_item.merge("slot" => "one_hand", "weaponType" => "axe")
        expect { described_class.validate!(data) }.not_to raise_error
      end

      it "accepts weaponType on a two_hand item" do
        data = valid_item.merge("slot" => "two_hand", "weaponType" => "staff")
        expect { described_class.validate!(data) }.not_to raise_error
      end
    end

    context "primary" do
      it "accepts a null primary" do
        data = valid_item.merge("primary" => nil)
        expect { described_class.validate!(data) }.not_to raise_error
      end

      it "raises for an unrecognized primary value" do
        data = valid_item.merge("primary" => "stamina")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /primary must be one of/)
      end

      it "raises when a ring item has a non-null primary" do
        data = valid_item.except("weaponType").merge("slot" => "ring", "primary" => "strength")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /primary must be null for this slot/)
      end

      it "raises when a neck item has a non-null primary" do
        data = valid_item.except("weaponType").merge("slot" => "neck", "primary" => "strength")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /primary must be null for this slot/)
      end

      it "accepts a ring item with a null primary" do
        data = valid_item.except("weaponType").merge("slot" => "ring", "primary" => nil, "secondaries" => ["stamina"])
        expect { described_class.validate!(data) }.not_to raise_error
      end
    end

    context "secondaries" do
      it "raises when secondaries is not an array" do
        data = valid_item.merge("secondaries" => "stamina")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /secondaries must be an array/)
      end

      it "raises for an unrecognized secondary value" do
        data = valid_item.merge("secondaries" => ["stamina", "spell_power"])
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /must be one of/)
      end

      it "raises when secondaries exceeds the slot's max (2-secondary slot)" do
        data = valid_item.except("weaponType").merge("slot" => "waist", "secondaries" => ["stamina", "crit_rating", "haste_rating"])
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /has at most 2 entries for slot "waist"/)
      end

      it "accepts exactly the max secondaries for a 3-secondary slot" do
        data = valid_item.except("weaponType").merge("slot" => "chest", "secondaries" => ["stamina", "crit_rating", "haste_rating"])
        expect { described_class.validate!(data) }.not_to raise_error
      end

      it "accepts fewer than the max secondaries" do
        data = valid_item.merge("secondaries" => ["stamina"])
        expect { described_class.validate!(data) }.not_to raise_error
      end
    end

    context "optional fields" do
      it "accepts a description and icon_url" do
        data = valid_item.merge("description" => "A fine blade.", "icon_url" => "../assets/sword.webp")
        expect { described_class.validate!(data) }.not_to raise_error
      end

      it "raises when description is not a string" do
        data = valid_item.merge("description" => 42)
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /description must be a string/)
      end

      it "accepts description, icon_url, shield, and secondaries explicitly null, same as omitted" do
        data = valid_item.merge("description" => nil, "icon_url" => nil, "shield" => nil, "secondaries" => nil)
        expect { described_class.validate!(data) }.not_to raise_error
      end
    end
  end
end
