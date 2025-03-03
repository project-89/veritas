#!/usr/bin/env node

/**
 * Memgraph Migration Script
 *
 * This script helps manage database migrations for the Memgraph database.
 * It applies migration files in order based on their version numbers.
 */

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const { MemgraphClient } = require('memgraph');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../apps/api/.env') });

// Configuration
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');
const MEMGRAPH_HOST = process.env.MEMGRAPH_HOST || 'localhost';
const MEMGRAPH_PORT = process.env.MEMGRAPH_PORT || 7687;
const MEMGRAPH_USERNAME = process.env.MEMGRAPH_USERNAME || 'memgraph';
const MEMGRAPH_PASSWORD = process.env.MEMGRAPH_PASSWORD || 'memgraph';

// Setup command line interface
program.version('1.0.0').description('Memgraph Migration Tool');

program
  .command('create <name>')
  .description('Create a new migration file')
  .action(createMigration);

program
  .command('up')
  .description('Apply all pending migrations')
  .option(
    '-v, --version <version>',
    'Apply migrations up to a specific version'
  )
  .action(upMigration);

program
  .command('down')
  .description('Rollback migrations')
  .option('-v, --version <version>', 'Rollback to a specific version')
  .option('-a, --all', 'Rollback all migrations')
  .action(downMigration);

program
  .command('status')
  .description('Show migration status')
  .action(migrationStatus);

program.parse(process.argv);

// Create a new migration file
async function createMigration(name) {
  try {
    // Ensure migrations directory exists
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
    }

    // Generate version number based on timestamp
    const version = Date.now().toString();
    const fileName = `${version}_${name.replace(/\s+/g, '_')}.js`;
    const filePath = path.join(MIGRATIONS_DIR, fileName);

    // Create migration file template
    const template = `/**
 * Migration: ${name}
 * Version: ${version}
 */

module.exports = {
  up: async (client) => {
    // Write your migration code here
    await client.executeCypher(\`
      // Your Cypher queries for applying the migration
    \`);
  },
  
  down: async (client) => {
    // Write your rollback code here
    await client.executeCypher(\`
      // Your Cypher queries for rolling back the migration
    \`);
  }
};
`;

    fs.writeFileSync(filePath, template);
    console.log(`Created migration file: ${fileName}`);
  } catch (error) {
    console.error('Error creating migration:', error);
    process.exit(1);
  }
}

// Apply migrations
async function upMigration(options) {
  try {
    const client = await connectToMemgraph();

    // Create migrations table if it doesn't exist
    await createMigrationsTable(client);

    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations(client);

    // Get all migration files
    const migrationFiles = getMigrationFiles();

    // Filter out already applied migrations
    const pendingMigrations = migrationFiles.filter((file) => {
      const version = getVersionFromFilename(file);
      return (
        !appliedMigrations.includes(version) &&
        (!options.version || version <= options.version)
      );
    });

    if (pendingMigrations.length === 0) {
      console.log('No pending migrations to apply.');
      await client.close();
      return;
    }

    // Sort migrations by version
    pendingMigrations.sort((a, b) => {
      return getVersionFromFilename(a) - getVersionFromFilename(b);
    });

    console.log(`Applying ${pendingMigrations.length} migration(s)...`);

    // Apply each migration
    for (const file of pendingMigrations) {
      const version = getVersionFromFilename(file);
      const name = getNameFromFilename(file);

      console.log(`Applying migration: ${name} (${version})`);

      const migration = require(path.join(MIGRATIONS_DIR, file));

      // Begin transaction
      await client.executeCypher('BEGIN');

      try {
        // Apply migration
        await migration.up(client);

        // Record migration
        await client.executeCypher(
          'CREATE (m:Migration {version: $version, name: $name, appliedAt: datetime()})',
          { version, name }
        );

        // Commit transaction
        await client.executeCypher('COMMIT');

        console.log(`Applied migration: ${name} (${version})`);
      } catch (error) {
        // Rollback transaction on error
        await client.executeCypher('ROLLBACK');
        console.error(`Error applying migration ${name} (${version}):`, error);
        process.exit(1);
      }
    }

    console.log('All migrations applied successfully.');
    await client.close();
  } catch (error) {
    console.error('Error applying migrations:', error);
    process.exit(1);
  }
}

// Rollback migrations
async function downMigration(options) {
  try {
    const client = await connectToMemgraph();

    // Check if migrations table exists
    const migrationsExist = await checkMigrationsTableExists(client);

    if (!migrationsExist) {
      console.log('No migrations have been applied.');
      await client.close();
      return;
    }

    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations(client);

    if (appliedMigrations.length === 0) {
      console.log('No migrations to roll back.');
      await client.close();
      return;
    }

    // Sort migrations by version (descending)
    appliedMigrations.sort((a, b) => b - a);

    // Determine which migrations to roll back
    let migrationsToRollback = [];

    if (options.all) {
      migrationsToRollback = appliedMigrations;
    } else if (options.version) {
      migrationsToRollback = appliedMigrations.filter(
        (version) => version > options.version
      );
    } else {
      // Default: roll back only the latest migration
      migrationsToRollback = [appliedMigrations[0]];
    }

    if (migrationsToRollback.length === 0) {
      console.log('No migrations to roll back.');
      await client.close();
      return;
    }

    console.log(`Rolling back ${migrationsToRollback.length} migration(s)...`);

    // Roll back each migration
    for (const version of migrationsToRollback) {
      // Find migration file
      const migrationFiles = getMigrationFiles();
      const file = migrationFiles.find(
        (f) => getVersionFromFilename(f) === version
      );

      if (!file) {
        console.error(`Migration file for version ${version} not found.`);
        continue;
      }

      const name = getNameFromFilename(file);
      console.log(`Rolling back migration: ${name} (${version})`);

      const migration = require(path.join(MIGRATIONS_DIR, file));

      // Begin transaction
      await client.executeCypher('BEGIN');

      try {
        // Roll back migration
        await migration.down(client);

        // Remove migration record
        await client.executeCypher(
          'MATCH (m:Migration {version: $version}) DELETE m',
          { version }
        );

        // Commit transaction
        await client.executeCypher('COMMIT');

        console.log(`Rolled back migration: ${name} (${version})`);
      } catch (error) {
        // Rollback transaction on error
        await client.executeCypher('ROLLBACK');
        console.error(
          `Error rolling back migration ${name} (${version}):`,
          error
        );
        process.exit(1);
      }
    }

    console.log('Rollback completed successfully.');
    await client.close();
  } catch (error) {
    console.error('Error rolling back migrations:', error);
    process.exit(1);
  }
}

// Show migration status
async function migrationStatus() {
  try {
    const client = await connectToMemgraph();

    // Check if migrations table exists
    const migrationsExist = await checkMigrationsTableExists(client);

    if (!migrationsExist) {
      console.log('No migrations have been applied.');
      await client.close();
      return;
    }

    // Get applied migrations with details
    const result = await client.executeCypher(`
      MATCH (m:Migration)
      RETURN m.version AS version, m.name AS name, m.appliedAt AS appliedAt
      ORDER BY m.version
    `);

    const appliedMigrations = result.records.map((record) => ({
      version: record.get('version'),
      name: record.get('name'),
      appliedAt: record.get('appliedAt'),
    }));

    // Get all migration files
    const migrationFiles = getMigrationFiles();

    // Create a list of all migrations (applied and pending)
    const allMigrations = migrationFiles.map((file) => {
      const version = getVersionFromFilename(file);
      const name = getNameFromFilename(file);
      const applied = appliedMigrations.find((m) => m.version === version);

      return {
        version,
        name,
        status: applied ? 'Applied' : 'Pending',
        appliedAt: applied ? applied.appliedAt : null,
      };
    });

    // Sort migrations by version
    allMigrations.sort((a, b) => a.version - b.version);

    // Display migration status
    console.log('Migration Status:');
    console.log('=================');

    if (allMigrations.length === 0) {
      console.log('No migrations found.');
    } else {
      console.log(
        'Version'.padEnd(15) +
          'Name'.padEnd(30) +
          'Status'.padEnd(10) +
          'Applied At'
      );
      console.log(
        '-------'.padEnd(15) +
          '----'.padEnd(30) +
          '------'.padEnd(10) +
          '----------'
      );

      allMigrations.forEach((migration) => {
        const appliedAt = migration.appliedAt
          ? new Date(migration.appliedAt).toLocaleString()
          : '';
        console.log(
          migration.version.padEnd(15) +
            migration.name.padEnd(30) +
            migration.status.padEnd(10) +
            appliedAt
        );
      });
    }

    await client.close();
  } catch (error) {
    console.error('Error getting migration status:', error);
    process.exit(1);
  }
}

// Helper functions

// Connect to Memgraph
async function connectToMemgraph() {
  try {
    const client = new MemgraphClient({
      host: MEMGRAPH_HOST,
      port: MEMGRAPH_PORT,
      username: MEMGRAPH_USERNAME,
      password: MEMGRAPH_PASSWORD,
    });

    await client.connect();
    return client;
  } catch (error) {
    console.error('Error connecting to Memgraph:', error);
    process.exit(1);
  }
}

// Create migrations table if it doesn't exist
async function createMigrationsTable(client) {
  try {
    // Create constraint to ensure unique versions
    await client.executeCypher(`
      CREATE CONSTRAINT IF NOT EXISTS ON (m:Migration) ASSERT m.version IS UNIQUE
    `);
  } catch (error) {
    console.error('Error creating migrations table:', error);
    process.exit(1);
  }
}

// Check if migrations table exists
async function checkMigrationsTableExists(client) {
  try {
    const result = await client.executeCypher(`
      MATCH (m:Migration) RETURN count(m) AS count
    `);

    return result.records[0].get('count') > 0;
  } catch (error) {
    console.error('Error checking migrations table:', error);
    process.exit(1);
  }
}

// Get applied migrations
async function getAppliedMigrations(client) {
  try {
    const result = await client.executeCypher(`
      MATCH (m:Migration) RETURN m.version AS version
    `);

    return result.records.map((record) => record.get('version'));
  } catch (error) {
    console.error('Error getting applied migrations:', error);
    process.exit(1);
  }
}

// Get all migration files
function getMigrationFiles() {
  try {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      return [];
    }

    return fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.match(/^\d+_.*\.js$/));
  } catch (error) {
    console.error('Error getting migration files:', error);
    process.exit(1);
  }
}

// Extract version from filename
function getVersionFromFilename(filename) {
  return filename.split('_')[0];
}

// Extract name from filename
function getNameFromFilename(filename) {
  return filename.replace(/^\d+_/, '').replace(/\.js$/, '').replace(/_/g, ' ');
}
