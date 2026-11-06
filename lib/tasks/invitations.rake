namespace :invitations do
  desc "Issue a signup invitation and print its link (INVITATION_HOST sets the site): bin/rails 'invitations:issue[a note]'"
  task :issue, [:note] => :environment do |_, args|
    invitation = Invitations::Issue.call(note: args[:note])
    host = ENV.fetch("INVITATION_HOST", "http://localhost:8000")
    puts Rails.application.routes.url_helpers.invitation_url(invitation.token, host: host)
  end
end
