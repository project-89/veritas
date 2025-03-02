#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { faker } = require('@faker-js/faker');

// Ensure output directory exists
const outputDir = path.join(__dirname, '..', 'data', 'mock');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Generate a random date within the last 30 days
const randomRecentDate = () => {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * 30));
  return date.toISOString();
};

// Generate a source node
const generateSource = (id) => {
  const platforms = ['twitter', 'reddit', 'facebook', 'news', 'blog'];
  const platform = faker.helpers.arrayElement(platforms);

  return {
    id: id || `source-${faker.string.uuid()}`,
    type: 'source',
    name: faker.internet.userName(),
    platform,
    url: faker.internet.url(),
    verified: Math.random() > 0.8,
    credibilityScore: faker.number.float({ min: 0, max: 1, precision: 0.01 }),
    followerCount:
      platform !== 'news'
        ? faker.number.int({ min: 0, max: 1000000 })
        : undefined,
    description: faker.lorem.sentence(),
    profileImageUrl: faker.image.avatar(),
    createdAt: faker.date.past().toISOString(),
    verificationStatus: faker.helpers.arrayElement([
      'verified',
      'unverified',
      'suspicious',
    ]),
    metadata: {
      location: faker.location.city(),
      joinDate: faker.date.past().toISOString(),
    },
  };
};

// Generate a content node
const generateContent = (id, sourceId) => {
  const contentTypes = ['post', 'article', 'comment', 'reply'];
  const contentType = faker.helpers.arrayElement(contentTypes);

  return {
    id: id || `content-${faker.string.uuid()}`,
    type: 'content',
    contentType,
    text: faker.lorem.paragraph(),
    sourceId: sourceId || `source-${faker.string.uuid()}`,
    url: faker.internet.url(),
    publishedAt: randomRecentDate(),
    engagementMetrics: {
      likes: faker.number.int({ min: 0, max: 10000 }),
      shares: faker.number.int({ min: 0, max: 5000 }),
      comments: faker.number.int({ min: 0, max: 1000 }),
      views: faker.number.int({ min: 0, max: 100000 }),
    },
    sentiment: faker.number.float({ min: -1, max: 1, precision: 0.01 }),
    entities: Array.from(
      { length: faker.number.int({ min: 0, max: 5 }) },
      () => ({
        name: faker.person.fullName(),
        type: faker.helpers.arrayElement([
          'person',
          'organization',
          'location',
          'event',
        ]),
        sentiment: faker.number.float({ min: -1, max: 1, precision: 0.01 }),
      })
    ),
    topics: Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () =>
      faker.word.sample().toLowerCase()
    ),
    metadata: {
      language: 'en',
      isOriginal: Math.random() > 0.3,
      containsMedia: Math.random() > 0.5,
    },
  };
};

// Generate a narrative
const generateNarrative = (id) => {
  return {
    id: id || `narrative-${faker.string.uuid()}`,
    type: 'narrative',
    title: faker.lorem.sentence(),
    description: faker.lorem.paragraph(),
    createdAt: randomRecentDate(),
    updatedAt: new Date().toISOString(),
    strength: faker.number.float({ min: 0, max: 1, precision: 0.01 }),
    topics: Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () =>
      faker.word.sample().toLowerCase()
    ),
    sentiment: faker.number.float({ min: -1, max: 1, precision: 0.01 }),
    contentCount: faker.number.int({ min: 5, max: 100 }),
    sourceCount: faker.number.int({ min: 2, max: 30 }),
    metadata: {
      status: faker.helpers.arrayElement([
        'active',
        'emerging',
        'fading',
        'dormant',
      ]),
      visibility: faker.number.float({ min: 0, max: 1, precision: 0.01 }),
    },
  };
};

// Generate a narrative branch
const generateNarrativeBranch = (narrativeId, parentId = null) => {
  return {
    id: `branch-${faker.string.uuid()}`,
    type: 'branch',
    narrativeId,
    parentId,
    title: faker.lorem.sentence(),
    description: faker.lorem.paragraph(),
    createdAt: randomRecentDate(),
    divergencePoint: randomRecentDate(),
    strength: faker.number.float({ min: 0, max: 1, precision: 0.01 }),
    topics: Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () =>
      faker.word.sample().toLowerCase()
    ),
    sentiment: faker.number.float({ min: -1, max: 1, precision: 0.01 }),
    contentCount: faker.number.int({ min: 2, max: 50 }),
    sourceCount: faker.number.int({ min: 1, max: 15 }),
    metadata: {
      status: faker.helpers.arrayElement([
        'active',
        'emerging',
        'fading',
        'dormant',
      ]),
      divergenceStrength: faker.number.float({
        min: 0,
        max: 1,
        precision: 0.01,
      }),
    },
  };
};

// Generate relationships between content and narratives
const generateContentNarrativeRelationship = (contentId, narrativeId) => {
  return {
    id: `rel-${faker.string.uuid()}`,
    type: 'relationship',
    sourceId: contentId,
    targetId: narrativeId,
    relationshipType: 'CONTRIBUTES_TO',
    strength: faker.number.float({ min: 0, max: 1, precision: 0.01 }),
    createdAt: new Date().toISOString(),
  };
};

// Generate a complete dataset
const generateDataset = () => {
  const sources = Array.from({ length: 50 }, () => generateSource());

  const contents = [];
  sources.forEach((source) => {
    const contentCount = faker.number.int({ min: 1, max: 10 });
    for (let i = 0; i < contentCount; i++) {
      contents.push(generateContent(null, source.id));
    }
  });

  const narratives = Array.from({ length: 10 }, () => generateNarrative());

  const branches = [];
  narratives.forEach((narrative) => {
    const branchCount = faker.number.int({ min: 0, max: 3 });
    for (let i = 0; i < branchCount; i++) {
      branches.push(generateNarrativeBranch(narrative.id));
    }
  });

  // Add some sub-branches
  branches.forEach((branch) => {
    if (Math.random() > 0.7) {
      const subBranchCount = faker.number.int({ min: 1, max: 2 });
      for (let i = 0; i < subBranchCount; i++) {
        const narrativeId = branch.narrativeId;
        branches.push(generateNarrativeBranch(narrativeId, branch.id));
      }
    }
  });

  const relationships = [];
  contents.forEach((content) => {
    if (Math.random() > 0.3) {
      const narrativeIndex = faker.number.int({
        min: 0,
        max: narratives.length - 1,
      });
      relationships.push(
        generateContentNarrativeRelationship(
          content.id,
          narratives[narrativeIndex].id
        )
      );
    }
  });

  return {
    sources,
    contents,
    narratives,
    branches,
    relationships,
  };
};

// Generate and save the dataset
const dataset = generateDataset();

// Save each entity type to a separate file
fs.writeFileSync(
  path.join(outputDir, 'sources.json'),
  JSON.stringify(dataset.sources, null, 2)
);
fs.writeFileSync(
  path.join(outputDir, 'contents.json'),
  JSON.stringify(dataset.contents, null, 2)
);
fs.writeFileSync(
  path.join(outputDir, 'narratives.json'),
  JSON.stringify(dataset.narratives, null, 2)
);
fs.writeFileSync(
  path.join(outputDir, 'branches.json'),
  JSON.stringify(dataset.branches, null, 2)
);
fs.writeFileSync(
  path.join(outputDir, 'relationships.json'),
  JSON.stringify(dataset.relationships, null, 2)
);

// Save the complete dataset
fs.writeFileSync(
  path.join(outputDir, 'dataset.json'),
  JSON.stringify(dataset, null, 2)
);

console.log(`Generated mock data in ${outputDir}`);
console.log(`- ${dataset.sources.length} sources`);
console.log(`- ${dataset.contents.length} content items`);
console.log(`- ${dataset.narratives.length} narratives`);
console.log(`- ${dataset.branches.length} narrative branches`);
console.log(`- ${dataset.relationships.length} relationships`);
console.log('Done!');
