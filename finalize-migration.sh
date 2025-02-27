#!/bin/bash

# Master script to finalize the migration to an Nx monorepo
# This script will:
# 1. Reorganize the repository
# 2. Update paths in the Nx monorepo
# 3. Update the Git repository

set -e

echo "=== Finalizing Migration to Nx Monorepo ==="
echo "Working directory: $(pwd)"

# Check if we're in the root of the repository
if [ ! -d "nx-monorepo" ]; then
  echo "Error: This script must be run from the root of the repository"
  echo "Please navigate to the root of the repository and try again"
  exit 1
fi

# Step 1: Reorganize the repository
echo "Step 1: Reorganizing the repository..."
./reorganize-repo.sh

# Step 2: Update paths in the Nx monorepo
echo "Step 2: Updating paths in the Nx monorepo..."
./update-paths.sh

# Step 3: Update the Git repository
echo "Step 3: Updating the Git repository..."
./update-git.sh

echo "=== Migration Finalized ==="
echo "The migration to an Nx monorepo has been finalized"
echo "The repository has been reorganized, paths have been updated, and changes have been committed"
echo "You may now push the changes to the remote repository" 