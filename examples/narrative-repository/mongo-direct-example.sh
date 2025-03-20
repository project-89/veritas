#!/bin/bash

# Exit on error
set -e

# Display execution steps
set -x

# Start MongoDB containers if they're not running
if ! docker ps | grep -q veritas-mongodb; then
  echo "Starting MongoDB containers..."
  docker-compose -f docker-compose.mongodb.yml up -d
  
  # Wait for MongoDB to be ready
  echo "Waiting for MongoDB to start..."
  sleep 5
else
  echo "MongoDB containers are already running."
fi

# Check MongoDB status
echo "MongoDB containers status:"
docker ps | grep veritas

# Connect to MongoDB Express UI
echo "MongoDB Express UI is available at: http://localhost:8081"
echo "You can use this UI to view and manage the MongoDB database."

# Create a simple direct MongoDB test using mongosh directly
echo "Creating a simple test document in MongoDB..."

# Create a temporary JavaScript file to run with mongosh
cat > mongo-test.js << EOF
// MongoDB test script
db = db.getSiblingDB('veritas');

// Create a collection for narrative insights if it doesn't exist
if (!db.getCollectionNames().includes('narrativeinsights')) {
  db.createCollection('narrativeinsights');
  print('Created narrativeinsights collection');
}

// Insert a test narrative insight
const testInsight = {
  id: 'test-' + new Date().getTime(),
  contentHash: 'hash-' + Math.random().toString(36).substring(7),
  sourceHash: 'source-' + Math.random().toString(36).substring(7),
  platform: 'twitter',
  timestamp: new Date(),
  themes: ['technology', 'ai', 'data'],
  entities: [
    { name: 'AI', type: 'technology', relevance: 0.9 },
    { name: 'Data', type: 'concept', relevance: 0.8 }
  ],
  sentiment: {
    score: 0.7,
    label: 'positive',
    confidence: 0.85
  },
  engagement: {
    total: 250,
    breakdown: { likes: 150, shares: 50, comments: 50 }
  },
  narrativeScore: 0.75,
  processedAt: new Date(),
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
};

db.narrativeinsights.insertOne(testInsight);
print('Inserted test insight with ID: ' + testInsight.id);

// Query the insights
const insights = db.narrativeinsights.find().toArray();
print('Total insights in database: ' + insights.length);

// List all insights
print('Listing all insights:');
insights.forEach(insight => {
  print('- ID: ' + insight.id + ', Platform: ' + insight.platform + ', Themes: ' + insight.themes.join(', '));
});
EOF

# Copy the script to the container
docker cp mongo-test.js veritas-mongodb:/tmp/

# Run the MongoDB script without TTY requirements
docker exec veritas-mongodb mongosh --quiet -u admin -p password --authenticationDatabase admin /tmp/mongo-test.js

# Clean up the temporary file
rm mongo-test.js

echo ""
echo "==============================================="
echo "MongoDB Repository Test Completed Successfully!"
echo "==============================================="
echo ""
echo "This demonstrates that:"
echo "1. MongoDB is running properly"
echo "2. We can create and store narrative insights"
echo "3. We can query the insights"
echo ""
echo "You can explore more with the MongoDB Express UI: http://localhost:8081" 