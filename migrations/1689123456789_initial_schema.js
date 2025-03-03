/**
 * Migration: initial schema
 * Version: 1689123456789
 */

module.exports = {
  up: async (client) => {
    // Create constraints for unique IDs
    await client.executeCypher(`
      CREATE CONSTRAINT IF NOT EXISTS ON (s:Source) ASSERT s.id IS UNIQUE
    `);

    await client.executeCypher(`
      CREATE CONSTRAINT IF NOT EXISTS ON (c:Content) ASSERT c.id IS UNIQUE
    `);

    await client.executeCypher(`
      CREATE CONSTRAINT IF NOT EXISTS ON (n:Narrative) ASSERT n.id IS UNIQUE
    `);

    await client.executeCypher(`
      CREATE CONSTRAINT IF NOT EXISTS ON (b:Branch) ASSERT b.id IS UNIQUE
    `);

    // Create indexes for better performance
    await client.executeCypher(`
      CREATE INDEX IF NOT EXISTS ON :Source(name)
    `);

    await client.executeCypher(`
      CREATE INDEX IF NOT EXISTS ON :Content(title)
    `);

    await client.executeCypher(`
      CREATE INDEX IF NOT EXISTS ON :Content(createdAt)
    `);

    await client.executeCypher(`
      CREATE INDEX IF NOT EXISTS ON :Narrative(name)
    `);

    await client.executeCypher(`
      CREATE INDEX IF NOT EXISTS ON :Narrative(createdAt)
    `);

    // Create initial system node
    await client.executeCypher(`
      MERGE (s:System {id: "veritas"})
      SET s.name = "Veritas",
          s.version = "1.0.0",
          s.createdAt = datetime(),
          s.updatedAt = datetime()
    `);
  },

  down: async (client) => {
    // Drop indexes
    await client.executeCypher(`
      DROP INDEX IF EXISTS ON :Narrative(createdAt)
    `);

    await client.executeCypher(`
      DROP INDEX IF EXISTS ON :Narrative(name)
    `);

    await client.executeCypher(`
      DROP INDEX IF EXISTS ON :Content(createdAt)
    `);

    await client.executeCypher(`
      DROP INDEX IF EXISTS ON :Content(title)
    `);

    await client.executeCypher(`
      DROP INDEX IF EXISTS ON :Source(name)
    `);

    // Drop constraints
    await client.executeCypher(`
      DROP CONSTRAINT IF EXISTS ON (b:Branch) ASSERT b.id IS UNIQUE
    `);

    await client.executeCypher(`
      DROP CONSTRAINT IF EXISTS ON (n:Narrative) ASSERT n.id IS UNIQUE
    `);

    await client.executeCypher(`
      DROP CONSTRAINT IF EXISTS ON (c:Content) ASSERT c.id IS UNIQUE
    `);

    await client.executeCypher(`
      DROP CONSTRAINT IF EXISTS ON (s:Source) ASSERT s.id IS UNIQUE
    `);

    // Delete system node
    await client.executeCypher(`
      MATCH (s:System {id: "veritas"})
      DELETE s
    `);
  },
};
