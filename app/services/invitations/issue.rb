module Invitations
  # Makes a new invitation, by a server admin or from the console (`by` nil).
  class Issue
    def self.call(by: nil, note: nil)
      Invitation.create!(created_by: by, note: note.to_s.strip.first(Invitation::NOTE_LIMIT).presence)
    end
  end
end
