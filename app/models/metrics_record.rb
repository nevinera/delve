# The base of models kept in the metrics database (config/database.yml).
class MetricsRecord < ActiveRecord::Base
  self.abstract_class = true
  connects_to database: {writing: :metrics, reading: :metrics}
end
