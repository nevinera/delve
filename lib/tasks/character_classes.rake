namespace :character_classes do
  desc "Re-fetch class content and re-extract abilities (IDENTIFIER=x to limit to one class)"
  task refetch: :environment do
    results = CharacterClasses::Refetch.call(identifier: ENV["IDENTIFIER"])
    abort "No matching character classes" if results.empty?

    results.each do |character_class, error|
      label = "#{character_class.identifier} #{character_class.version}"
      puts error ? "FAILED #{label}: #{error}" : "ok #{label} (#{character_class.class_abilities.count} abilities)"
    end
  end
end
