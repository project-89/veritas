#!/usr/bin/env npx ts-node
/**
 * Narrative Analysis Script
 * Searches for a topic across multiple platforms, classifies content,
 * and outputs sentiment analysis results.
 *
 * Usage: npx ts-node scripts/analyze-narrative.ts "project89"
 */

import * as dotenv from 'dotenv';

dotenv.config();

import { Scraper, SearchMode } from '@the-convocation/twitter-scraper';
import axios from 'axios';

const QUERY = process.argv[2] || 'project89';
const LIMIT = parseInt(process.argv[3] || '50', 10);

interface ClassifiedPost {
  platform: string;
  text: string;
  author: string;
  timestamp: Date;
  url: string;
  sentiment: string;
  sentimentScore: number;
  topics: string[];
  engagement: {
    likes: number;
    comments: number;
    shares: number;
  };
}

// Simple local sentiment analysis (same approach as ContentClassificationService)
function analyzeSentiment(text: string): { label: string; score: number } {
  const lower = text.toLowerCase();

  const positiveWords = [
    'love',
    'great',
    'amazing',
    'awesome',
    'excellent',
    'good',
    'best',
    'fantastic',
    'wonderful',
    'brilliant',
    'incredible',
    'beautiful',
    'happy',
    'excited',
    'impressive',
    'perfect',
    'support',
    'thank',
    'cool',
    'nice',
    'helpful',
    'innovative',
    'revolutionary',
  ];
  const negativeWords = [
    'hate',
    'terrible',
    'awful',
    'bad',
    'worst',
    'horrible',
    'disgusting',
    'trash',
    'garbage',
    'stupid',
    'scam',
    'fake',
    'fraud',
    'sucks',
    'disappointed',
    'angry',
    'annoying',
    'toxic',
    'attack',
    'destroy',
    'lie',
    'liar',
    'pathetic',
    'ridiculous',
    'manipulat',
    'exploit',
  ];

  let posCount = 0;
  let negCount = 0;
  for (const word of positiveWords) {
    if (lower.includes(word)) posCount++;
  }
  for (const word of negativeWords) {
    if (lower.includes(word)) negCount++;
  }

  const total = posCount + negCount;
  if (total === 0) return { label: 'neutral', score: 0 };

  const score = (posCount - negCount) / total;
  if (score > 0.2) return { label: 'positive', score };
  if (score < -0.2) return { label: 'negative', score };
  return { label: 'neutral', score };
}

async function searchReddit(query: string, limit: number): Promise<ClassifiedPost[]> {
  console.log(`\n🔍 Searching Reddit for "${query}"...`);

  try {
    const response = await axios.get(`https://www.reddit.com/search.json`, {
      params: { q: query, sort: 'new', limit, raw_json: 1 },
      headers: { 'User-Agent': 'Veritas/1.0.0 (narrative analysis)' },
      timeout: 15000,
    });

    const posts = response.data?.data?.children || [];
    console.log(`  Found ${posts.length} Reddit posts`);

    return posts.map((child: any) => {
      const post = child.data;
      const text = post.selftext || post.title;
      const sentiment = analyzeSentiment(text);

      return {
        platform: 'reddit',
        text: text.slice(0, 500),
        author: post.author,
        timestamp: new Date(post.created_utc * 1000),
        url: `https://reddit.com${post.permalink}`,
        sentiment: sentiment.label,
        sentimentScore: sentiment.score,
        topics: [post.subreddit],
        engagement: {
          likes: Math.round(post.score * (post.upvote_ratio || 1)),
          comments: post.num_comments,
          shares: 0,
        },
      };
    });
  } catch (error: any) {
    console.error(`  Reddit search failed: ${error.message}`);
    return [];
  }
}

async function searchTwitter(query: string, limit: number): Promise<ClassifiedPost[]> {
  const cookies = process.env['TWITTER_COOKIES'];
  if (!cookies) {
    console.log('\n⏭️  Skipping Twitter (no TWITTER_COOKIES configured)');
    return [];
  }

  console.log(`\n🔍 Searching Twitter/X for "${query}"...`);

  try {
    const scraper = new Scraper();
    const cookieArr: string[] = JSON.parse(cookies);
    await scraper.setCookies(cookieArr);

    if (!(await scraper.isLoggedIn())) {
      console.log('  Twitter auth failed — cookies may be expired');
      return [];
    }

    const tweets: ClassifiedPost[] = [];
    const generator = scraper.searchTweets(query, limit, SearchMode.Latest);

    for await (const tweet of generator) {
      if (tweets.length >= limit) break;
      const text = tweet.text || '';
      const sentiment = analyzeSentiment(text);

      tweets.push({
        platform: 'twitter',
        text: text.slice(0, 500),
        author: tweet.username || 'unknown',
        timestamp: tweet.timeParsed || new Date(),
        url: tweet.permanentUrl || '',
        sentiment: sentiment.label,
        sentimentScore: sentiment.score,
        topics: tweet.hashtags || [],
        engagement: {
          likes: tweet.likes || 0,
          comments: tweet.replies || 0,
          shares: tweet.retweets || 0,
        },
      });
    }

    console.log(`  Found ${tweets.length} tweets`);
    await scraper.logout();
    return tweets;
  } catch (error: any) {
    console.error(`  Twitter search failed: ${error.message}`);
    return [];
  }
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  VERITAS NARRATIVE ANALYSIS: "${QUERY}"`);
  console.log(`${'='.repeat(60)}`);

  // Search across platforms
  const [redditPosts, twitterPosts] = await Promise.all([
    searchReddit(QUERY, LIMIT),
    searchTwitter(QUERY, LIMIT),
  ]);

  const allPosts = [...redditPosts, ...twitterPosts].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
  );

  if (allPosts.length === 0) {
    console.log('\nNo posts found. Try a different query.');
    return;
  }

  // Sentiment breakdown
  const positive = allPosts.filter((p) => p.sentiment === 'positive');
  const negative = allPosts.filter((p) => p.sentiment === 'negative');
  const neutral = allPosts.filter((p) => p.sentiment === 'neutral');

  const avgScore = allPosts.reduce((sum, p) => sum + p.sentimentScore, 0) / allPosts.length;

  console.log(`\n${'─'.repeat(60)}`);
  console.log('  RESULTS SUMMARY');
  console.log(`${'─'.repeat(60)}`);
  console.log(`  Total posts analyzed: ${allPosts.length}`);
  console.log(`  Reddit: ${redditPosts.length} | Twitter: ${twitterPosts.length}`);
  console.log('');
  console.log('  SENTIMENT BREAKDOWN:');
  console.log(
    `    Positive: ${positive.length} (${((positive.length / allPosts.length) * 100).toFixed(1)}%)`,
  );
  console.log(
    `    Neutral:  ${neutral.length} (${((neutral.length / allPosts.length) * 100).toFixed(1)}%)`,
  );
  console.log(
    `    Negative: ${negative.length} (${((negative.length / allPosts.length) * 100).toFixed(1)}%)`,
  );
  console.log(`    Average sentiment score: ${avgScore.toFixed(3)} (range: -1 to 1)`);
  console.log('');

  // Platform breakdown
  for (const platform of ['reddit', 'twitter']) {
    const platformPosts = allPosts.filter((p) => p.platform === platform);
    if (platformPosts.length === 0) continue;

    const platPositive = platformPosts.filter((p) => p.sentiment === 'positive').length;
    const platNegative = platformPosts.filter((p) => p.sentiment === 'negative').length;
    const platNeutral = platformPosts.filter((p) => p.sentiment === 'neutral').length;
    const platAvg = platformPosts.reduce((s, p) => s + p.sentimentScore, 0) / platformPosts.length;

    console.log(`  ${platform.toUpperCase()} (${platformPosts.length} posts):`);
    console.log(
      `    +${platPositive} positive | ${platNeutral} neutral | -${platNegative} negative | avg: ${platAvg.toFixed(3)}`,
    );
  }

  // Engagement stats
  const totalLikes = allPosts.reduce((s, p) => s + p.engagement.likes, 0);
  const totalComments = allPosts.reduce((s, p) => s + p.engagement.comments, 0);
  const totalShares = allPosts.reduce((s, p) => s + p.engagement.shares, 0);
  console.log('');
  console.log('  ENGAGEMENT:');
  console.log(`    Total likes: ${totalLikes.toLocaleString()}`);
  console.log(`    Total comments: ${totalComments.toLocaleString()}`);
  console.log(`    Total shares: ${totalShares.toLocaleString()}`);

  // Most negative posts
  if (negative.length > 0) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log('  MOST NEGATIVE POSTS');
    console.log(`${'─'.repeat(60)}`);
    const worstPosts = negative.sort((a, b) => a.sentimentScore - b.sentimentScore).slice(0, 5);

    for (const post of worstPosts) {
      const date = post.timestamp.toISOString().split('T')[0];
      console.log(
        `\n  [${post.platform}] ${date} | by ${post.author} | score: ${post.sentimentScore.toFixed(2)}`,
      );
      console.log(`  ${post.text.slice(0, 200)}${post.text.length > 200 ? '...' : ''}`);
      console.log(`  ${post.url}`);
    }
  }

  // Most positive posts
  if (positive.length > 0) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log('  MOST POSITIVE POSTS');
    console.log(`${'─'.repeat(60)}`);
    const bestPosts = positive.sort((a, b) => b.sentimentScore - a.sentimentScore).slice(0, 5);

    for (const post of bestPosts) {
      const date = post.timestamp.toISOString().split('T')[0];
      console.log(
        `\n  [${post.platform}] ${date} | by ${post.author} | score: ${post.sentimentScore.toFixed(2)}`,
      );
      console.log(`  ${post.text.slice(0, 200)}${post.text.length > 200 ? '...' : ''}`);
      console.log(`  ${post.url}`);
    }
  }

  // Timeline (last 7 days)
  console.log(`\n${'─'.repeat(60)}`);
  console.log('  DAILY SENTIMENT (last 7 days)');
  console.log(`${'─'.repeat(60)}`);

  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dayPosts = allPosts.filter((p) => p.timestamp >= dayStart && p.timestamp < dayEnd);

    const label = dayStart.toISOString().split('T')[0];
    if (dayPosts.length === 0) {
      console.log(`  ${label}: -- no posts --`);
      continue;
    }

    const dayPos = dayPosts.filter((p) => p.sentiment === 'positive').length;
    const dayNeg = dayPosts.filter((p) => p.sentiment === 'negative').length;
    const dayAvg = dayPosts.reduce((s, p) => s + p.sentimentScore, 0) / dayPosts.length;

    const bar =
      dayAvg >= 0
        ? `${'█'.repeat(Math.round(dayAvg * 20))}${'░'.repeat(20 - Math.round(dayAvg * 20))}`
        : `${'░'.repeat(20 + Math.round(dayAvg * 20))}${'▓'.repeat(-Math.round(dayAvg * 20))}`;

    console.log(
      `  ${label}: ${dayPosts.length.toString().padStart(3)} posts | +${dayPos} -${dayNeg} | ${bar} ${dayAvg.toFixed(2)}`,
    );
  }

  console.log(`\n${'='.repeat(60)}\n`);
}

main().catch(console.error);
