# Takes a batch of measurements from a page (client/src/metrics/metrics.js). Metric leaves out
# anything that doesn't make sense, so this passes the batch along as it came.
class MetricsController < ApplicationController
  rate_limit to: 30, within: 1.minute, only: :create, by: -> { current_user.id }, with: -> { head :too_many_requests }

  def create
    batch = params.to_unsafe_h
    tags = batch["tags"].is_a?(Hash) ? batch["tags"] : {}
    Metric.record_batch!(batch["metrics"], user: current_user, tags: tags)
    head :no_content
  end
end
