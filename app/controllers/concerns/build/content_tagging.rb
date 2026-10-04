# Tag checks shared by the world and class editors' Publish actions.
module Build::ContentTagging
  private

  def tag_exists?(client, tag)
    client.tag_sha(tag)
    true
  rescue Github::NotFoundError
    false
  end

  # Publishing tags a branch's head only if it's still the commit the editor
  # last checked (expected_sha: expanded, for a world; loaded or saved, for a
  # class), so nothing committed since then is published unvalidated.
  # `checked` and `next_step` word the errors for the editor.
  def branch_error(client, branch, expected_sha, checked: "loaded", next_step: "try again")
    return "A branch and its #{checked} commit are required." if branch.blank? || expected_sha.blank?
    head = client.branch_sha(branch)
    return if head == expected_sha
    "#{branch} has moved on since it was #{checked} (now at #{head[0, 7]}); reload, then #{next_step}."
  rescue Github::NotFoundError
    "Branch #{branch} doesn't exist."
  end
end
