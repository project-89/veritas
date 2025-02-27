#!/bin/bash

# Script to update paths in the Nx monorepo after reorganization
# This script should be run after reorganize-repo.sh

set -e

echo "=== Updating Paths in Nx Monorepo ==="
echo "Working directory: $(pwd)"

# Update paths in package.json
echo "Updating paths in package.json..."
sed -i '' 's|"nx-monorepo/veritas-nx"|"."|g' package.json

# Update paths in nx.json
echo "Updating paths in nx.json..."
sed -i '' 's|"nx-monorepo/veritas-nx"|"."|g' nx.json

# Update paths in tsconfig.base.json
echo "Updating paths in tsconfig.base.json..."
sed -i '' 's|"nx-monorepo/veritas-nx"|"."|g' tsconfig.base.json

# Update paths in MIGRATION-STATUS.md
echo "Updating paths in MIGRATION-STATUS.md..."
sed -i '' 's|`nx-monorepo/veritas-nx`|the root of the repository|g' MIGRATION-STATUS.md

# Update paths in MIGRATION-SUMMARY.md
echo "Updating paths in MIGRATION-SUMMARY.md..."
sed -i '' 's|`nx-monorepo/veritas-nx`|the root of the repository|g' MIGRATION-SUMMARY.md

# Update paths in README.md
echo "Updating paths in README.md..."
sed -i '' 's|cd nx-monorepo/veritas-nx|cd .|g' README.md

# Update paths in fix-imports.sh
echo "Updating paths in fix-imports.sh..."
sed -i '' 's|nx-monorepo/veritas-nx|.|g' fix-imports.sh

echo "=== Paths Updated ==="
echo "All paths have been updated to reflect the new repository structure" 