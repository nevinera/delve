module Invitations
  # Signs a Google account in: the user it already is, or a new one with an unused invitation. It
  # gives back the user, or `error` saying why not. Account creation and using the invitation happen
  # together, so a used invitation never makes a second account.
  class SignIn
    Result = Data.define(:user, :error)

    def self.call(auth, invitation_token: nil) = new(auth, invitation_token).call

    def initialize(auth, invitation_token)
      @auth, @token = auth, invitation_token
    end

    def call
      user = User.find_by(provider: @auth.provider, uid: @auth.uid)
      return Result.new(user, nil) if user

      invitation = @token.presence && Invitation.unused.find_by(token: @token)
      return Result.new(nil, "You need an invitation to make an account.") unless invitation

      User.transaction do
        user = User.create!(provider: @auth.provider, uid: @auth.uid, email: @auth.info.email, name: @auth.info.name)
        raise ActiveRecord::Rollback unless invitation.use!(user)
      end
      return Result.new(nil, "That invitation has been used.") unless user&.persisted? && invitation.used_by_id == user.id
      Result.new(user, nil)
    rescue ActiveRecord::RecordInvalid
      Result.new(nil, "Sign in failed - could not create account.")
    end
  end
end
