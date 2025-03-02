const express = require('express');
const cors = require('cors');
const { faker } = require('@faker-js/faker');

const app = express();
const PORT = process.env.PORT || 4001;
const DELAY_MS = parseInt(process.env.DELAY_MS || '200', 10);
const ERROR_RATE = parseFloat(process.env.ERROR_RATE || '0.05');

// Middleware
app.use(cors());
app.use(express.json());

// Helper to simulate network delay
const simulateDelay = (req, res, next) => {
  setTimeout(next, DELAY_MS);
};

// Helper to simulate occasional errors
const simulateErrors = (req, res, next) => {
  if (Math.random() < ERROR_RATE) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message:
        'The Twitter API is experiencing issues. Please try again later.',
    });
  }
  next();
};

app.use(simulateDelay);
app.use(simulateErrors);

// Generate a mock tweet
const generateTweet = (id) => {
  const user = {
    id: faker.string.uuid(),
    username: faker.internet.userName(),
    name: faker.person.fullName(),
    profile_image_url: faker.image.avatar(),
    verified: Math.random() > 0.8,
    followers_count: faker.number.int({ min: 1, max: 1000000 }),
    following_count: faker.number.int({ min: 1, max: 10000 }),
  };

  return {
    id: id || faker.string.uuid(),
    text: faker.lorem.paragraph(),
    created_at: faker.date.recent({ days: 7 }).toISOString(),
    author_id: user.id,
    user,
    public_metrics: {
      retweet_count: faker.number.int({ min: 0, max: 10000 }),
      reply_count: faker.number.int({ min: 0, max: 1000 }),
      like_count: faker.number.int({ min: 0, max: 50000 }),
      quote_count: faker.number.int({ min: 0, max: 1000 }),
    },
    entities: {
      hashtags: Array.from(
        { length: faker.number.int({ min: 0, max: 5 }) },
        () => ({
          tag: faker.word.sample().toLowerCase(),
        })
      ),
      mentions: Array.from(
        { length: faker.number.int({ min: 0, max: 3 }) },
        () => ({
          username: faker.internet.userName(),
        })
      ),
      urls: Array.from(
        { length: faker.number.int({ min: 0, max: 2 }) },
        () => ({
          url: faker.internet.url(),
          expanded_url: faker.internet.url(),
          display_url: faker.internet.domainName(),
        })
      ),
    },
    referenced_tweets:
      Math.random() > 0.7
        ? [
            {
              type: faker.helpers.arrayElement([
                'replied_to',
                'quoted',
                'retweeted',
              ]),
              id: faker.string.uuid(),
            },
          ]
        : undefined,
    conversation_id: faker.string.uuid(),
    lang: 'en',
    source: faker.helpers.arrayElement([
      'Twitter Web App',
      'Twitter for iPhone',
      'Twitter for Android',
    ]),
  };
};

// Generate a collection of tweets
const generateTweets = (count) => {
  return Array.from({ length: count }, () => generateTweet());
};

// Routes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Mock Twitter API v2 search endpoint
app.get('/2/tweets/search/recent', (req, res) => {
  const query = req.query.query || '';
  const max_results = parseInt(req.query.max_results || '10', 10);

  const tweets = generateTweets(max_results);

  res.json({
    data: tweets,
    meta: {
      result_count: tweets.length,
      newest_id: tweets[0]?.id,
      oldest_id: tweets[tweets.length - 1]?.id,
      next_token: faker.string.alphanumeric(20),
    },
  });
});

// Mock Twitter API v2 tweet lookup endpoint
app.get('/2/tweets/:id', (req, res) => {
  const id = req.params.id;

  res.json({
    data: generateTweet(id),
  });
});

// Mock Twitter API v2 user timeline endpoint
app.get('/2/users/:id/tweets', (req, res) => {
  const id = req.params.id;
  const max_results = parseInt(req.query.max_results || '10', 10);

  const tweets = generateTweets(max_results);

  res.json({
    data: tweets,
    meta: {
      result_count: tweets.length,
      newest_id: tweets[0]?.id,
      oldest_id: tweets[tweets.length - 1]?.id,
      next_token: faker.string.alphanumeric(20),
    },
  });
});

// Mock Twitter API v2 user lookup endpoint
app.get('/2/users/:id', (req, res) => {
  const id = req.params.id;

  const user = {
    id,
    name: faker.person.fullName(),
    username: faker.internet.userName(),
    created_at: faker.date.past().toISOString(),
    description: faker.lorem.sentence(),
    location: faker.location.city(),
    profile_image_url: faker.image.avatar(),
    verified: Math.random() > 0.8,
    public_metrics: {
      followers_count: faker.number.int({ min: 1, max: 1000000 }),
      following_count: faker.number.int({ min: 1, max: 10000 }),
      tweet_count: faker.number.int({ min: 1, max: 50000 }),
      listed_count: faker.number.int({ min: 0, max: 1000 }),
    },
  };

  res.json({
    data: user,
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Mock Twitter API running on port ${PORT}`);
});
