# Superseded class versions expire a week after a newer one is fetched, like
# world versions do once replaced. Versions already superseded get the same
# week from now.
class AddExpiresAtToCharacterClasses < ActiveRecord::Migration[8.1]
  def up
    add_column :character_classes, :expires_at, :datetime
    CharacterClass.reset_column_information
    CharacterClass.fetched.distinct.pluck(:identifier).each { |identifier| CharacterClass.expire_superseded!(identifier) }
  end

  def down
    remove_column :character_classes, :expires_at
  end
end
