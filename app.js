require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { TwitterApi } = require('twitter-api-v2');
const { v4: uuidv4 } = require('uuid');

// Configuration
const DRY_RUN = process.env.DRY_RUN === 'true';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const TIMEZONE = process.env.TIMEZONE || 'Europe/Istanbul';

// Dosya yolları
const schedulePath = path.resolve(__dirname, 'schedule.json');
const logPath = path.resolve(__dirname, 'scheduler.log');

// Idempotency cache (simple in-memory for this MVP)
const postedHashes = new Set();

// Rate limit handling
const RATE_LIMIT_BACKOFF_BASE = 1000; // 1 second
const MAX_RETRIES = 5;

// Initialize Twitter API client with OAuth 1.1a (Simpler & More Stable)
async function initializeClient() {
  let client;
  try {
    if (!process.env.TWITTER_API_KEY && !DRY_RUN) {
      throw new Error('Twitter API credentials are required when DRY_RUN=false');
    }

    if (process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET &&
        process.env.TWITTER_ACCESS_TOKEN && process.env.TWITTER_ACCESS_SECRET) {

      client = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY,
        appSecret: process.env.TWITTER_API_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessSecret: process.env.TWITTER_ACCESS_SECRET,
      }).readWrite;

      log('info', 'AUTH_INIT', 'Twitter client initialized successfully with OAuth 1.1a');
    } else if (DRY_RUN) {
      log('info', 'AUTH_INIT', 'DRY_RUN mode - Twitter client not initialized');
    } else {
      throw new Error('All Twitter API credentials (API_KEY, API_SECRET, ACCESS_TOKEN, ACCESS_SECRET) are required when DRY_RUN=false');
    }
  } catch (error) {
    if (DRY_RUN) {
      log('warn', 'AUTH_INIT', 'Twitter client initialization skipped in DRY_RUN mode', null, error.message);
    } else {
      log('error', 'AUTH_INIT', 'Failed to initialize Twitter client', null, error.message);
      process.exit(1);
    }
  }
  return client;
}

let client;

/**
 * Enhanced logging system
 */
function log(level, action, result = null, error = null, extra = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    action,
    result,
    error,
    ...extra
  };

  // Console output
  const consoleMsg = `[${timestamp}] ${level.toUpperCase()} ${action}${result ? ` - ${result}` : ''}${error ? ` - ERROR: ${error}` : ''}`;
  console.log(consoleMsg);

  // File output
  try {
    const logLine = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync(logPath, logLine);

    // Simple log rotation (keep last 1000 lines)
    rotateLogIfNeeded();
  } catch (err) {
    console.error('Failed to write to log file:', err.message);
  }
}

/**
 * Simple log rotation
 */
function rotateLogIfNeeded() {
  try {
    const stats = fs.statSync(logPath);
    if (stats.size > 1024 * 1024) { // 1MB
      const backupPath = `${logPath}.${Date.now()}.bak`;
      fs.renameSync(logPath, backupPath);
      log('info', 'LOG_ROTATION', `Log rotated to ${backupPath}`);
    }
  } catch (err) {
    // Ignore rotation errors
  }
}

/**
 * Generate hash for idempotency
 */
function generateContentHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoffDelay(attempt, baseDelay = RATE_LIMIT_BACKOFF_BASE) {
  return Math.min(baseDelay * Math.pow(2, attempt), 300000); // Max 5 minutes
}

/**
 * Parse date with timezone support
 */
function parseScheduledDate(dateString) {
  // Force timezone to Europe/Istanbul if not specified
  const date = new Date(dateString);
  if (dateString.includes('+') || dateString.includes('Z')) {
    return date;
  }

  // Assume Europe/Istanbul timezone for dates without timezone
  const istanbulOffset = 3 * 60; // +03:00 in minutes
  return new Date(date.getTime() - (istanbulOffset * 60 * 1000));
}

/**
 * Post tweet with retry logic and rate limit handling
 */
async function postTweet(tweetData, attempt = 0) {
  const contentHash = generateContentHash(tweetData.text);

  // Idempotency check
  if (postedHashes.has(contentHash)) {
    log('warn', 'IDEMPOTENCY', 'Duplicate content detected, skipping', null, null, { tweetId: tweetData.id });
    return { success: false, duplicate: true };
  }

  if (DRY_RUN) {
    log('info', 'DRY_RUN', 'Would post tweet', `Tweet: "${tweetData.text}"`, null, { tweetId: tweetData.id });
    postedHashes.add(contentHash);
    return { success: true, dryRun: true };
  }

  try {
    const response = await client.v2.tweet(tweetData.text);

    if (response.data) {
      postedHashes.add(contentHash);
      log('info', 'TWEET_POSTED', 'Tweet posted successfully', `Tweet ID: ${response.data.id}`, null, {
        tweetId: tweetData.id,
        twitterId: response.data.id
      });
      return { success: true, data: response.data };
    }
  } catch (error) {
    const statusCode = error.code || error.statusCode;
    const isRateLimit = statusCode === 429;
    const isRetryable = statusCode >= 500 || isRateLimit;

    log('error', 'TWEET_ERROR', `Tweet posting failed (attempt ${attempt + 1})`, null, error.message, {
      tweetId: tweetData.id,
      statusCode,
      isRateLimit,
      attempt: attempt + 1
    });

    // Retry logic for rate limits and server errors
    if (isRetryable && attempt < MAX_RETRIES) {
      const delay = isRateLimit
        ? calculateBackoffDelay(attempt)
        : calculateBackoffDelay(attempt, 5000); // 5 second base for server errors

      log('info', 'RETRY_SCHEDULED', `Retrying in ${delay}ms`, null, null, {
        tweetId: tweetData.id,
        attempt: attempt + 1,
        delay
      });

      await new Promise(resolve => setTimeout(resolve, delay));
      return await postTweet(tweetData, attempt + 1);
    }

    return { success: false, error: error.message, statusCode };
  }
}

/**
 * Update schedule item status
 */
function updateScheduleItem(schedule, itemId, updates) {
  const itemIndex = schedule.findIndex(item => item.id === itemId);
  if (itemIndex !== -1) {
    schedule[itemIndex] = { ...schedule[itemIndex], ...updates };
  }
  return schedule;
}

/**
 * Main scheduler function
 */
async function runScheduler() {
  try {
    // Initialize client if needed
    if (!client) {
      client = await initializeClient();
    }

    log('info', 'SCHEDULER_START', 'Scheduler started');

    // Load schedule
    let schedule = [];
    try {
      const scheduleData = fs.readFileSync(schedulePath, 'utf-8');
      schedule = JSON.parse(scheduleData);
    } catch (error) {
      log('error', 'SCHEDULE_LOAD', 'Failed to load schedule', null, error.message);
      return;
    }

    const now = new Date();
    const dueTweets = schedule.filter(item =>
      item.status === 'pending' &&
      parseScheduledDate(item.runAt) <= now
    );

    if (dueTweets.length === 0) {
      log('info', 'SCHEDULER_CHECK', 'No tweets due for posting');
      return;
    }

    log('info', 'SCHEDULER_PROCESS', `Processing ${dueTweets.length} due tweets`);

    for (const tweet of dueTweets) {
      const result = await postTweet(tweet);
      const updates = { attempts: tweet.attempts + 1 };

      if (result.success) {
        if (result.dryRun) {
          updates.status = 'posted';
          updates.postedAt = now.toISOString();
        } else {
          updates.status = 'posted';
          updates.postedAt = now.toISOString();
          updates.tweetId = result.data?.id;
        }
      } else if (result.duplicate) {
        updates.status = 'posted'; // Mark as posted to avoid reprocessing
        updates.postedAt = now.toISOString();
        updates.duplicate = true;
      } else {
        // Handle failures
        if (tweet.attempts >= MAX_RETRIES - 1) {
          updates.status = 'failed';
          updates.error = result.error;
          updates.failedAt = now.toISOString();
        } else {
          updates.status = 'pending';
          updates.nextAttemptAt = new Date(now.getTime() + calculateBackoffDelay(tweet.attempts)).toISOString();
        }
      }

      schedule = updateScheduleItem(schedule, tweet.id, updates);
    }

    // Save updated schedule
    try {
      fs.writeFileSync(schedulePath, JSON.stringify(schedule, null, 2));
      log('info', 'SCHEDULE_SAVE', 'Schedule updated successfully');
    } catch (error) {
      log('error', 'SCHEDULE_SAVE', 'Failed to save schedule', null, error.message);
    }

    log('info', 'SCHEDULER_END', 'Scheduler completed');

  } catch (error) {
    log('error', 'SCHEDULER_CRASH', 'Scheduler crashed', null, error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('info', 'SHUTDOWN', 'Received SIGINT, shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('info', 'SHUTDOWN', 'Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

// Run scheduler
if (require.main === module) {
  runScheduler();
}

module.exports = { runScheduler, log, postTweet };
