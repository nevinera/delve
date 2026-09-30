# A two-segment "N.N" content version, ordered numerically (so "1.10" > "1.9").
class ContentVersion
  include Comparable

  FORMAT = /\A\d+\.\d+\z/

  attr_reader :major, :minor

  def self.parse(string)
    raise ArgumentError, "invalid version: #{string.inspect}" unless string.to_s.match?(FORMAT)
    new(*string.split(".").map(&:to_i))
  end

  def initialize(major, minor)
    @major = major
    @minor = minor
  end

  def <=>(other)
    return nil unless other.is_a?(ContentVersion)
    [major, minor] <=> [other.major, other.minor]
  end

  def to_s = "#{major}.#{minor}"
end
