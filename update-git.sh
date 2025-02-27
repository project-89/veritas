#!/bin/bash

# Script to update the Git repository after reorganization
# This script should be run after reorganize-repo.sh

set -e

echo "=== Updating Git Repository ==="
echo "Working directory: $(pwd)"

# Add all changes to Git
echo "Adding all changes to Git..."
git add .

# Create a commit message
echo "Creating commit message..."
cat > .git-commit-msg.tmp << EOL
Reorganize repository for Nx monorepo

- Move original files to /old directory for reference
- Make Nx monorepo the new root of the repository
- Update documentation to reflect the reorganization

This commit completes the migration to an Nx monorepo structure.
EOL

# Commit the changes
echo "Committing changes..."
git commit -F .git-commit-msg.tmp

# Remove temporary commit message file
rm .git-commit-msg.tmp

echo "=== Git Repository Updated ==="
echo "Changes have been committed to the repository"
echo "You may now push the changes to the remote repository" 