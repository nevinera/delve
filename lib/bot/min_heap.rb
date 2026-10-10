# frozen_string_literal: true

module Bot
  # A binary min-heap: push items with a priority, pop the lowest.
  class MinHeap
    def initialize
      @items = []
    end

    def empty? = @items.empty?

    def push(priority, item)
      @items << [priority, item]
      sift_up(@items.size - 1)
    end

    def pop
      top = @items.first
      last = @items.pop
      unless @items.empty?
        @items[0] = last
        sift_down(0)
      end
      top&.last
    end

    private

    def sift_up(i)
      while i.positive?
        parent = (i - 1) / 2
        break if priority(parent) <= priority(i)
        swap(parent, i)
        i = parent
      end
    end

    def sift_down(i)
      loop do
        smallest = [i, 2 * i + 1, 2 * i + 2].select { |j| j < @items.size }.min_by { |j| priority(j) }
        break if smallest == i
        swap(smallest, i)
        i = smallest
      end
    end

    def priority(i) = @items[i][0]

    def swap(i, j)
      @items[i], @items[j] = @items[j], @items[i]
    end
  end
end
