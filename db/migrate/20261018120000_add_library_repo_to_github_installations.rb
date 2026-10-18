# Where the world builder imports shared content (unit types, items, stamp
# sets) from: another public content repo, as "username/reponame". Nil means
# the connected repo itself.
class AddLibraryRepoToGithubInstallations < ActiveRecord::Migration[8.1]
  def change
    add_column :github_installations, :library_repo, :string
  end
end
