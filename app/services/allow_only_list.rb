class AllowOnlyList
  PATH = Rails.root.join("config/allow_only.yml")

  # config/allow_only.yml is gitignored and optional. When absent, or when a
  # given key is absent/empty, that provider allows everyone. When a key has
  # entries, only those values may sign in / connect.
  def self.allows?(key, value)
    list = entries[key.to_s]
    return true if list.blank?
    list.include?(value)
  end

  def self.entries
    return {} unless File.exist?(PATH)
    YAML.load_file(PATH) || {}
  end
  private_class_method :entries
end
