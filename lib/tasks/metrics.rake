namespace :metrics do
  desc "Sum up metrics: SINCE=hours (24), BY=tag, NAME=prefix"
  task summary: :environment do
    rows = Metric.summary(since: ENV.fetch("SINCE", "24").to_f.hours.ago, by: ENV["BY"], name: ENV["NAME"])
    puts "nothing measured" if rows.empty?
    rows.each do |row|
      label = [row[:name], ENV["BY"] && "#{ENV["BY"]}=#{row[ENV["BY"]]}"].compact.join(" ")
      puts format("%-40s n=%-6d p50=%-10.1f p95=%-10.1f max=%.1f", label, row[:count], row[:p50], row[:p95], row[:max])
    end
  end

  desc "Delete metrics older than Metric::KEEP_DAYS"
  task prune: :environment do
    puts "pruned #{Metric.prune}"
  end
end
