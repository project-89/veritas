# Repository Reorganization Process

This document explains the process of reorganizing the repository to make the Nx monorepo the new base of the repository.

## Overview

The reorganization process involves:

1. Moving all original files to an `/old` directory for reference
2. Moving the Nx monorepo from `nx-monorepo/veritas-nx` to the root of the repository
3. Updating paths in the Nx monorepo to reflect the new structure
4. Committing the changes to the Git repository

## Scripts

The following scripts have been created to automate the reorganization process:

### 1. `reorganize-repo.sh`

This script:
- Creates an `/old` directory
- Moves all original files to the `/old` directory (except for `nx-monorepo` and the scripts)
- Moves the contents of `nx-monorepo/veritas-nx` to the root of the repository
- Removes the empty `nx-monorepo` directory
- Creates a `README.REORGANIZATION.md` file that explains the changes

### 2. `update-paths.sh`

This script:
- Updates paths in `package.json`, `nx.json`, and `tsconfig.base.json`
- Updates references to `nx-monorepo/veritas-nx` in documentation files
- Ensures that all paths reflect the new repository structure

### 3. `update-git.sh`

This script:
- Adds all changes to Git
- Creates a commit message
- Commits the changes to the Git repository

### 4. `finalize-migration.sh`

This is a master script that runs all three scripts in sequence:
1. `reorganize-repo.sh`
2. `update-paths.sh`
3. `update-git.sh`

## How to Run the Reorganization

To reorganize the repository, simply run the `finalize-migration.sh` script from the root of the repository:

```bash
./finalize-migration.sh
```

This will execute all the necessary steps to reorganize the repository and commit the changes.

## After Reorganization

After the reorganization:

1. The Nx monorepo will be at the root of the repository
2. All original files will be in the `/old` directory
3. All paths will be updated to reflect the new structure
4. The changes will be committed to the Git repository

You can then push the changes to the remote repository:

```bash
git push origin <branch-name>
```

## Reverting the Reorganization

If you need to revert the reorganization, you can use Git to revert the commit:

```bash
git revert <commit-hash>
```

Alternatively, you can manually move the files back to their original locations. 