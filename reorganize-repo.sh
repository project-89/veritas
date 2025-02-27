#!/bin/bash

# Script to reorganize the repository by moving original files to /old
# and making the Nx monorepo the new root

set -e

echo "=== Reorganizing Repository ==="
echo "Working directory: $(pwd)"

# Create /old directory
echo "Creating /old directory..."
mkdir -p old

# Move all original files to /old except for nx-monorepo and the script itself
echo "Moving original files to /old..."
for file in $(ls -A | grep -v "nx-monorepo\|old\|reorganize-repo.sh\|update-paths.sh\|update-git.sh\|finalize-migration.sh\|REORGANIZATION.md"); do
  echo "Moving $file to old/"
  mv "$file" old/
done

# Move nx-monorepo/veritas-nx contents to root
echo "Moving nx-monorepo/veritas-nx contents to root..."
mv nx-monorepo/veritas-nx/* .
mv nx-monorepo/veritas-nx/.* . 2>/dev/null || true  # Move hidden files, ignore errors

# Remove empty nx-monorepo directory
echo "Removing empty nx-monorepo directory..."
rm -rf nx-monorepo

# Create a README note about the reorganization
echo "Creating README note about the reorganization..."
cat > README.REORGANIZATION.md << EOL
# Repository Reorganization

This repository has been reorganized as part of the migration to an Nx monorepo structure.

## Changes Made

1. Original repository files have been moved to the \`/old\` directory for reference
2. The Nx monorepo structure is now at the root of the repository

## Why This Change?

This reorganization makes the Nx monorepo the new base of the repository, which:

- Simplifies development workflows
- Makes it clearer that the Nx structure is the primary codebase
- Follows standard practices for Nx projects

## Accessing Original Files

If you need to reference the original repository structure, you can find all files in the \`/old\` directory.
EOL

echo "=== Repository Reorganization Complete ==="
echo "Original files are now in the /old directory"
echo "Nx monorepo is now at the root of the repository"
echo "Please review the changes and commit them to the repository" 