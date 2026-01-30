#!/usr/bin/env node

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const moment = require('moment');
const sqlite3 = require('sqlite3').verbose();
const { TwitterApi } = require('twitter-api-v2');
const { v4: uuidv4 } = require('uuid');
const { RateLimiterMemory } = require('rate-limiter-flexible');

// Configuration
const PORT = process.env.PORT || 3000;
const DRY_RUN = process.env.DRY_RUN === 'true';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const TIMEZONE = process.env.TIMEZONE || 'Europe/Istanbul';

// Rate limiting configuration (Twitter API limits - halved for safety)
const TWEET_DAILY_LIMIT = 150;  // Halved: 150 tweets per day
const TWEET_HOURLY_LIMIT = 25;  // Halved: 25 tweets per hour
const TWEET_MINUTE_LIMIT = 3;   // Halved: 3 tweets per minute

// Files
const schedulePath = path.resolve(__dirname, 'schedule.json');
const logPath = path.resolve(__dirname, 'scheduler.log');
const dbPath = path.resolve(__dirname, 'x-scheduler.db');

// SQLite Database
let db;

// Rate limiters (will be initialized after database)
let dailyLimiter, hourlyLimiter, minuteLimiter;

// Database initialization
function initDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        log('ERROR', 'DATABASE_INIT', 'Failed to connect to SQLite database', null, err.message);
        reject(err);
        return;
      }
      log('SUCCESS', 'DATABASE_INIT', 'Connected to SQLite database successfully', dbPath);

      // Create tables
      db.serialize(() => {
        // Tweets table
        db.run(`
          CREATE TABLE IF NOT EXISTS tweets (
            id TEXT PRIMARY KEY,
            text TEXT NOT NULL,
            runAt TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            attempts INTEGER DEFAULT 0,
            createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
            updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            postedAt TEXT,
            tweetId TEXT,
            error TEXT,
            failedAt TEXT
          )
        `, function(err) {
          if (err) {
            log('ERROR', 'DATABASE_TABLE_CREATE', 'Failed to create tweets table', null, err.message);
            reject(err);
            return;
          }
          log('SUCCESS', 'DATABASE_TABLE_CREATE', 'Tweets table created/verified successfully');
        });

        // Rate limits table
        db.run(`
          CREATE TABLE IF NOT EXISTS rate_limits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            period TEXT NOT NULL, -- 'daily', 'hourly', 'minute'
            date TEXT NOT NULL, -- YYYY-MM-DD for daily, YYYY-MM-DD-HH for hourly, YYYY-MM-DD-HH-MM for minute
            used INTEGER DEFAULT 0,
            createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
            updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(period, date)
          )
        `, function(err) {
          if (err) {
            log('ERROR', 'DATABASE_TABLE_CREATE', 'Failed to create rate_limits table', null, err.message);
            reject(err);
            return;
          }
          log('SUCCESS', 'DATABASE_TABLE_CREATE', 'Rate limits table created/verified successfully');
        });

        // Migrate existing data if needed
        migrateExistingData().then(() => {
          log('SUCCESS', 'DATABASE_MIGRATION', 'Data migration completed successfully');
          // Initialize rate limiters with current usage
          initializeRateLimiters().then(() => {
            log('SUCCESS', 'DATABASE_INIT', 'Database fully initialized with tables, migration and rate limiters');
            resolve();
          }).catch(reject);
        }).catch((migrationError) => {
          log('ERROR', 'DATABASE_MIGRATION', 'Migration failed', null, migrationError.message);
          reject(migrationError);
        });
      });
    });
  });
}

// Migrate existing JSON data to SQLite
async function migrateExistingData() {
  try {
    if (!fs.existsSync(schedulePath)) {
      log('INFO', 'DATABASE_MIGRATION', 'No existing schedule.json file found, skipping migration');
      return;
    }

    const existingData = JSON.parse(fs.readFileSync(schedulePath, 'utf-8'));

    if (existingData.length > 0) {
      log('INFO', 'DATABASE_MIGRATION', `Starting migration of ${existingData.length} tweets from JSON to SQLite`);

      let migratedCount = 0;
      let errorCount = 0;

      for (const tweet of existingData) {
        try {
          await new Promise((resolve, reject) => {
            db.run(`
              INSERT OR REPLACE INTO tweets (id, text, runAt, status, attempts, postedAt, tweetId, error, failedAt, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              tweet.id,
              tweet.text,
              tweet.runAt,
              tweet.status || 'pending',
              tweet.attempts || 0,
              tweet.postedAt,
              tweet.tweetId,
              tweet.error,
              tweet.failedAt,
              tweet.createdAt || new Date().toISOString()
            ], function(err) {
              if (err) {
                log('ERROR', 'DATABASE_MIGRATION', `Failed to migrate tweet ${tweet.id}`, null, err.message);
                errorCount++;
              } else {
                migratedCount++;
              }
              resolve();
            });
          });
        } catch (error) {
          log('ERROR', 'DATABASE_MIGRATION', `Migration error for tweet ${tweet.id}`, null, error.message);
          errorCount++;
        }
      }

      // Backup and remove old file
      const backupPath = schedulePath + '.backup';
      fs.renameSync(schedulePath, backupPath);
      log('SUCCESS', 'DATABASE_MIGRATION', `Migration completed: ${migratedCount} tweets migrated, ${errorCount} errors. Backup created at ${backupPath}`);
    } else {
      log('INFO', 'DATABASE_MIGRATION', 'Existing schedule.json is empty, skipping migration');
    }
  } catch (error) {
    log('ERROR', 'DATABASE_MIGRATION', 'Migration process failed', null, error.message);
    throw error;
  }
}

// Initialize rate limiters with current usage from database
async function initializeRateLimiters() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const currentHour = `${today}-${String(now.getHours()).padStart(2, '0')}`;
  const currentMinute = `${currentHour}-${String(now.getMinutes()).padStart(2, '0')}`;

  log('INFO', 'RATE_LIMIT_INIT', 'Initializing rate limiters with database values');

  // Get current usage from database
  const dailyUsed = await getRateLimitUsage('daily', today);
  const hourlyUsed = await getRateLimitUsage('hourly', currentHour);
  const minuteUsed = await getRateLimitUsage('minute', currentMinute);

  // Initialize rate limiters with remaining points
  dailyLimiter = new RateLimiterMemory({
    keyPrefix: 'twitter_daily',
    points: Math.max(0, TWEET_DAILY_LIMIT - dailyUsed),
    duration: 24 * 60 * 60, // 24 hours
  });

  hourlyLimiter = new RateLimiterMemory({
    keyPrefix: 'twitter_hourly',
    points: Math.max(0, TWEET_HOURLY_LIMIT - hourlyUsed),
    duration: 60 * 60, // 1 hour
  });

  minuteLimiter = new RateLimiterMemory({
    keyPrefix: 'twitter_minute',
    points: Math.max(0, TWEET_MINUTE_LIMIT - minuteUsed),
    duration: 60, // 1 minute
  });

  log('SUCCESS', 'RATE_LIMIT_INIT', 'Rate limiters initialized successfully', null, null, {
    dailyLimit: { used: dailyUsed, limit: TWEET_DAILY_LIMIT, remaining: Math.max(0, TWEET_DAILY_LIMIT - dailyUsed) },
    hourlyLimit: { used: hourlyUsed, limit: TWEET_HOURLY_LIMIT, remaining: Math.max(0, TWEET_HOURLY_LIMIT - hourlyUsed) },
    minuteLimit: { used: minuteUsed, limit: TWEET_MINUTE_LIMIT, remaining: Math.max(0, TWEET_MINUTE_LIMIT - minuteUsed) }
  });
}

// Get rate limit usage from database
function getRateLimitUsage(period, date) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT used FROM rate_limits
      WHERE period = ? AND date = ?
    `, [period, date], (err, row) => {
      if (err) {
        console.error('Error getting rate limit usage:', err.message);
        resolve(0);
        return;
      }
      resolve(row ? row.used : 0);
    });
  });
}

// Update rate limit usage in database
function updateRateLimitUsage(period, date, used = 1) {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT OR REPLACE INTO rate_limits (period, date, used, updatedAt)
      VALUES (?, ?, COALESCE((SELECT used FROM rate_limits WHERE period = ? AND date = ?), 0) + ?, ?)
    `, [period, date, period, date, used, new Date().toISOString()], function(err) {
      if (err) {
        console.error('Error updating rate limit:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Idempotency cache
const postedHashes = new Set();

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Twitter client
let twitterClient = null;

async function initializeTwitterClient() {
  try {
    if (!process.env.TWITTER_API_KEY && !DRY_RUN) {
      console.log('❌ TWITTER_API_KEY gerekli (DRY_RUN=false için)');
      return null;
    }

    if (process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET &&
        process.env.TWITTER_ACCESS_TOKEN && process.env.TWITTER_ACCESS_SECRET) {

      twitterClient = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY,
        appSecret: process.env.TWITTER_API_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessSecret: process.env.TWITTER_ACCESS_SECRET,
      }).readWrite;

      console.log('✅ Twitter client initialized');
      return twitterClient;
    } else if (DRY_RUN) {
      console.log('🔧 DRY_RUN mode - Twitter client not initialized');
      return null;
    } else {
      console.log('❌ Twitter API credentials eksik');
      return null;
    }
  } catch (error) {
    console.log('❌ Twitter client initialization error:', error.message);
    return null;
  }
}

// Enhanced logging function with detailed information
function log(level, action, result = null, error = null, extra = {}) {
  const timestamp = new Date().toISOString();
  const istanbulTime = new Date(timestamp);
  istanbulTime.setHours(istanbulTime.getHours() + 3); // Convert to Istanbul time
  const istanbulTimeStr = istanbulTime.toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  // Create detailed log entry
  const logEntry = {
    timestamp,
    istanbul_time: istanbulTimeStr,
    level: level.toUpperCase(),
    action,
    result,
    error,
    ...extra
  };

  // Human-readable console output
  const consoleTime = istanbulTimeStr;
  const levelEmoji = {
    'INFO': '📋',
    'WARN': '⚠️',
    'ERROR': '❌',
    'DEBUG': '🔍',
    'SUCCESS': '✅'
  }[level.toUpperCase()] || '📝';

  let consoleMsg = `${levelEmoji} [${consoleTime}] ${level.toUpperCase()}: ${action}`;

  if (result) {
    consoleMsg += ` → ${result}`;
  }

  if (error) {
    consoleMsg += ` ❌ ${error}`;
  }

    // Add extra details for console
    if (extra && extra.tweetId) {
      consoleMsg += ` | Tweet ID: ${extra.tweetId}`;
    }
    if (extra && extra.twitterId) {
      consoleMsg += ` | Twitter ID: ${extra.twitterId}`;
    }
    if (extra && extra.rateLimit) {
      consoleMsg += ` | Rate Limit: ${extra.rateLimit}`;
    }
    if (extra && extra.attempts !== undefined) {
      consoleMsg += ` | Attempt: ${extra.attempts}`;
    }

  console.log(consoleMsg);

  // Detailed file logging
  try {
    // Create human-readable log line for file
    let logLine = `[${istanbulTimeStr}] ${levelEmoji} ${level.toUpperCase()}: ${action}\n`;

    if (result) {
      logLine += `   📝 Result: ${result}\n`;
    }

    if (error) {
      logLine += `   ❌ Error: ${error}\n`;
    }

    // Add contextual information
    if (extra && extra.tweetText) {
      logLine += `   💬 Tweet: "${extra.tweetText.substring(0, 100)}${extra.tweetText.length > 100 ? '...' : ''}"\n`;
    }

    if (extra && extra.scheduledTime) {
      logLine += `   ⏰ Scheduled: ${extra.scheduledTime}\n`;
    }

    if (extra && extra.tweetId) {
      logLine += `   🆔 Tweet ID: ${extra.tweetId}\n`;
    }

    if (extra && extra.twitterId) {
      logLine += `   🐦 Twitter ID: ${extra.twitterId}\n`;
    }

    if (extra && extra.rateLimit) {
      logLine += `   🚦 Rate Limit: ${extra.rateLimit}\n`;
    }

    if (extra && extra.attempts !== undefined) {
      logLine += `   🔄 Attempt: ${extra.attempts}\n`;
    }

    if (extra && extra.dailyLimit) {
      logLine += `   📊 Daily Limit: ${extra.dailyLimit.used}/${extra.dailyLimit.limit} (${extra.dailyLimit.remaining} remaining)\n`;
    }

    if (extra && extra.hourlyLimit) {
      logLine += `   🕐 Hourly Limit: ${extra.hourlyLimit.used}/${extra.hourlyLimit.limit} (${extra.hourlyLimit.remaining} remaining)\n`;
    }

    if (extra && extra.minuteLimit) {
      logLine += `   ⏱️ Minute Limit: ${extra.minuteLimit.used}/${extra.minuteLimit.limit} (${extra.minuteLimit.remaining} remaining)\n`;
    }

    if (extra && extra.systemInfo) {
      logLine += `   💻 System: ${extra.systemInfo}\n`;
    }

    if (extra && extra.databaseInfo) {
      logLine += `   💾 Database: ${extra.databaseInfo}\n`;
    }

    logLine += `   ──────────────────────────────────────────────────\n`;

    fs.appendFileSync(logPath, logLine);
  } catch (err) {
    console.error('❌ Log yazma hatası:', err.message);
  }
}

// System status logging
function logSystemStatus() {
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();

  log('INFO', 'SYSTEM_STATUS', 'System status check', null, null, {
    systemInfo: `Memory: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB used, Uptime: ${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`
  });
}

// Database operation logging
function logDatabaseOperation(operation, table, details = {}) {
  log('DEBUG', 'DATABASE_OPERATION', `${operation} on ${table}`, null, null, {
    databaseInfo: `Table: ${table}, Operation: ${operation}`,
    ...details
  });
}

// Load tweets from database
function loadTweets() {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT * FROM tweets
      ORDER BY runAt ASC
    `, [], (err, rows) => {
      if (err) {
        console.error('Tweets yükleme hatası:', err.message);
        resolve([]);
        return;
      }
      resolve(rows || []);
    });
  });
}

// Save tweet to database
function saveTweet(tweet) {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT OR REPLACE INTO tweets
      (id, text, runAt, status, attempts, createdAt, updatedAt, postedAt, tweetId, error, failedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      tweet.id,
      tweet.text,
      tweet.runAt,
      tweet.status,
      tweet.attempts,
      tweet.createdAt || new Date().toISOString(),
      tweet.updatedAt || new Date().toISOString(),
      tweet.postedAt,
      tweet.tweetId,
      tweet.error,
      tweet.failedAt
    ], function(err) {
      if (err) {
        console.error('Tweet kaydetme hatası:', err.message);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

// Update tweet in database
function updateTweet(id, updates) {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];

    Object.keys(updates).forEach(key => {
      if (key !== 'id') {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    });

    values.push(new Date().toISOString()); // updatedAt
    values.push(id);

    db.run(`
      UPDATE tweets
      SET ${fields.join(', ')}, updatedAt = ?
      WHERE id = ?
    `, values, function(err) {
      if (err) {
        console.error('Tweet güncelleme hatası:', err.message);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

// Delete tweet from database
function deleteTweet(id) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM tweets WHERE id = ?`, [id], function(err) {
      if (err) {
        console.error('Tweet silme hatası:', err.message);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

// Check rate limits
async function checkRateLimits() {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentHour = `${today}-${String(now.getHours()).padStart(2, '0')}`;
    const currentMinute = `${currentHour}-${String(now.getMinutes()).padStart(2, '0')}`;

    // Get database usage
    const [dailyUsed, hourlyUsed, minuteUsed] = await Promise.all([
      getRateLimitUsage('daily', today),
      getRateLimitUsage('hourly', currentHour),
      getRateLimitUsage('minute', currentMinute)
    ]);

    // Check memory limiters
    const [daily, hourly, minute] = await Promise.all([
      dailyLimiter.get('user'),
      hourlyLimiter.get('user'),
      minuteLimiter.get('user')
    ]);

    // Combine database and memory usage
    const totalDailyUsed = dailyUsed + (daily?.consumedPoints || 0);
    const totalHourlyUsed = hourlyUsed + (hourly?.consumedPoints || 0);
    const totalMinuteUsed = minuteUsed + (minute?.consumedPoints || 0);

    return {
      daily: {
        remaining: Math.max(0, TWEET_DAILY_LIMIT - totalDailyUsed),
        used: totalDailyUsed,
        limit: TWEET_DAILY_LIMIT,
        resetTime: daily?.msBeforeNext || 0
      },
      hourly: {
        remaining: Math.max(0, TWEET_HOURLY_LIMIT - totalHourlyUsed),
        used: totalHourlyUsed,
        limit: TWEET_HOURLY_LIMIT,
        resetTime: hourly?.msBeforeNext || 0
      },
      minute: {
        remaining: Math.max(0, TWEET_MINUTE_LIMIT - totalMinuteUsed),
        used: totalMinuteUsed,
        limit: TWEET_MINUTE_LIMIT,
        resetTime: minute?.msBeforeNext || 0
      }
    };
  } catch (error) {
    console.error('Rate limit kontrol hatası:', error.message);
    return {
      daily: { remaining: TWEET_DAILY_LIMIT, used: 0, limit: TWEET_DAILY_LIMIT, resetTime: 0 },
      hourly: { remaining: TWEET_HOURLY_LIMIT, used: 0, limit: TWEET_HOURLY_LIMIT, resetTime: 0 },
      minute: { remaining: TWEET_MINUTE_LIMIT, used: 0, limit: TWEET_MINUTE_LIMIT, resetTime: 0 }
    };
  }
}

// Post tweet with rate limiting
async function postTweet(tweetData) {
  const contentHash = generateContentHash(tweetData.text);

  // Idempotency check
  if (postedHashes.has(contentHash)) {
    log('warn', 'IDEMPOTENCY', 'Duplicate content detected', null, null, { tweetId: tweetData.id });
    return { success: false, duplicate: true };
  }

  // Check rate limits
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const currentHour = `${today}-${String(now.getHours()).padStart(2, '0')}`;
  const currentMinute = `${currentHour}-${String(now.getMinutes()).padStart(2, '0')}`;

  try {
    // Check if we can post by checking database usage first
    const [dailyUsed, hourlyUsed, minuteUsed] = await Promise.all([
      getRateLimitUsage('daily', today),
      getRateLimitUsage('hourly', currentHour),
      getRateLimitUsage('minute', currentMinute)
    ]);

    // Check if any limit would be exceeded
    if (dailyUsed >= TWEET_DAILY_LIMIT) {
      return { success: false, rateLimit: true, message: 'Günlük tweet limiti aşıldı' };
    }
    if (hourlyUsed >= TWEET_HOURLY_LIMIT) {
      return { success: false, rateLimit: true, message: 'Saatlik tweet limiti aşıldı' };
    }
    if (minuteUsed >= TWEET_MINUTE_LIMIT) {
      return { success: false, rateLimit: true, message: 'Dakikalık tweet limiti aşıldı' };
    }

    // Consume rate limits in memory
    await Promise.all([
      dailyLimiter.consume('user', 1),
      hourlyLimiter.consume('user', 1),
      minuteLimiter.consume('user', 1)
    ]);

    // Update database usage
    await Promise.all([
      updateRateLimitUsage('daily', today),
      updateRateLimitUsage('hourly', currentHour),
      updateRateLimitUsage('minute', currentMinute)
    ]);

    log('INFO', 'RATE_LIMIT_CONSUME', 'Rate limits consumed successfully', null, null, {
      tweetId: tweetData.id,
      dailyLimit: { used: dailyUsed + 1, limit: TWEET_DAILY_LIMIT },
      hourlyLimit: { used: hourlyUsed + 1, limit: TWEET_HOURLY_LIMIT },
      minuteLimit: { used: minuteUsed + 1, limit: TWEET_MINUTE_LIMIT }
    });

  } catch (rejRes) {
    const resetTime = Math.ceil(rejRes.msBeforeNext / 1000 / 60); // minutes
    log('warn', 'RATE_LIMIT', `Rate limit exceeded, retry in ${resetTime} minutes`, null, null, {
      tweetId: tweetData.id,
      resetTime
    });
    return {
      success: false,
      rateLimit: true,
      resetTime: rejRes.msBeforeNext,
      message: `Rate limit aşıldı. ${resetTime} dakika sonra tekrar dene.`
    };
  }

  if (DRY_RUN) {
    log('INFO', 'DRY_RUN', 'Tweet posting simulated (DRY_RUN mode)', null, null, {
      tweetId: tweetData.id,
      tweetText: tweetData.text,
      attempts: tweetData.attempts
    });
    postedHashes.add(contentHash);
    return { success: true, dryRun: true };
  }

  if (!twitterClient) {
    return { success: false, error: 'Twitter client not initialized' };
  }

  try {
    const response = await twitterClient.v2.tweet(tweetData.text);

    if (response.data) {
      postedHashes.add(contentHash);
      log('SUCCESS', 'TWEET_POSTED', 'Tweet posted successfully to Twitter', null, null, {
        tweetId: tweetData.id,
        twitterId: response.data.id,
        tweetText: tweetData.text,
        attempts: tweetData.attempts,
        postedAt: new Date().toISOString()
      });
      return { success: true, data: response.data };
    }
  } catch (error) {
    log('ERROR', 'TWEET_ERROR', 'Tweet posting failed', null, error.message, {
      tweetId: tweetData.id,
      tweetText: tweetData.text,
      attempts: tweetData.attempts,
      statusCode: error.code,
      errorType: error.constructor.name
    });
    return { success: false, error: error.message };
  }
}

// Generate hash for idempotency
function generateContentHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// Parse scheduled date
function parseScheduledDate(dateString) {
  if (!dateString) return null;

  // If dateString already has timezone info, use it directly
  if (dateString.includes('+') || dateString.includes('Z')) {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  }

  // For local date/time strings (from HTML form), treat as Istanbul time
  // HTML input type="datetime-local" returns format like "2025-09-08T23:02"
  // We need to append Istanbul timezone offset
  try {
    // Create date object and assume it's in Istanbul timezone
    const date = new Date(dateString + ':00+03:00');
    return isNaN(date.getTime()) ? null : date;
  } catch (error) {
    console.error('Date parsing error:', error);
    return null;
  }
}

// API Routes

// Get dashboard data
app.get('/api/dashboard', async (req, res) => {
  try {
    const tweets = await loadTweets();
    const rateLimits = await checkRateLimits();

    const stats = {
      total: tweets.length,
      pending: tweets.filter(t => t.status === 'pending').length,
      posted: tweets.filter(t => t.status === 'posted').length,
      failed: tweets.filter(t => t.status === 'failed').length,
      rateLimits,
      nextTweet: tweets
        .filter(t => t.status === 'pending')
        .sort((a, b) => new Date(a.runAt) - new Date(b.runAt))[0]
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all tweets
app.get('/api/tweets', async (req, res) => {
  try {
    const tweets = await loadTweets();
    res.json({ success: true, data: tweets });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add new tweet
app.post('/api/tweets', async (req, res) => {
  try {
    const { text, dateTime } = req.body;

    if (!text || !dateTime) {
      return res.status(400).json({
        success: false,
        error: 'Tweet metni ve tarih/saat gerekli'
      });
    }

    // Parse datetime string (comes from HTML datetime-local input)
    const scheduledDate = parseScheduledDate(dateTime);

    if (!scheduledDate) {
      return res.status(400).json({
        success: false,
        error: 'Geçersiz tarih/saat formatı'
      });
    }

    // Create tweet object
    const newTweet = {
      id: uuidv4(),
      runAt: scheduledDate.toISOString(),
      text: text.trim(),
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString()
    };

    if (await saveTweet(newTweet)) {
      log('SUCCESS', 'TWEET_ADDED', 'Tweet added successfully via API', null, null, {
        tweetId: newTweet.id,
        tweetText: newTweet.text,
        scheduledTime: newTweet.runAt
      });
      res.json({ success: true, data: newTweet });
    } else {
      log('ERROR', 'TWEET_ADD_FAILED', 'Failed to save tweet to database', null, 'Database insert failed', {
        tweetId: newTweet.id,
        tweetText: newTweet.text
      });
      res.status(500).json({ success: false, error: 'Tweet kaydedilemedi' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete tweet
app.delete('/api/tweets/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (await deleteTweet(id)) {
      log('info', 'TWEET_DELETED', 'Tweet deleted via API', null, null, { tweetId: id });
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: 'Tweet bulunamadı' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update tweet
app.put('/api/tweets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { text, dateTime } = req.body;

    const updates = {};

    // Update text
    if (text !== undefined) {
      updates.text = text.trim();
    }

    // Update dateTime
    if (dateTime) {
      const scheduledDate = parseScheduledDate(dateTime);
      if (scheduledDate) {
        updates.runAt = scheduledDate.toISOString();
        updates.status = 'pending'; // Reset status when time changes
        updates.attempts = 0;
      }
    }

    if (Object.keys(updates).length > 0) {
      if (await updateTweet(id, updates)) {
        log('info', 'TWEET_UPDATED', 'Tweet updated via API', null, null, { tweetId: id });
        res.json({ success: true });
      } else {
        res.status(500).json({ success: false, error: 'Tweet güncellenemedi' });
      }
    } else {
      res.status(400).json({ success: false, error: 'Güncellenecek veri bulunamadı' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get rate limits
app.get('/api/rate-limits', async (req, res) => {
  try {
    const rateLimits = await checkRateLimits();
    res.json({ success: true, data: rateLimits });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Scheduler function (runs every minute)
async function runScheduler() {
  try {
    const tweets = await loadTweets();
    const now = new Date();

    const dueTweets = tweets.filter(tweet => {
      if (tweet.status !== 'pending') return false;
      const runAt = parseScheduledDate(tweet.runAt);
      return runAt && runAt <= now;
    });

    if (dueTweets.length === 0) {
      log('INFO', 'SCHEDULER_CHECK', 'No tweets due for posting', null, null, {
        totalTweets: tweets.length,
        pendingTweets: tweets.filter(t => t.status === 'pending').length,
        nextTweet: tweets
          .filter(t => t.status === 'pending')
          .sort((a, b) => new Date(a.runAt) - new Date(b.runAt))[0]
      });
      return;
    }

    log('INFO', 'SCHEDULER_PROCESS', `Processing ${dueTweets.length} due tweets`, null, null, {
      dueTweetsCount: dueTweets.length,
      totalTweets: tweets.length,
      pendingTweets: tweets.filter(t => t.status === 'pending').length
    });

    let successCount = 0;
    let errorCount = 0;
    let rateLimitCount = 0;

    for (const tweet of dueTweets) {
      log('DEBUG', 'SCHEDULER_TWEET_PROCESS', `Processing tweet ${tweet.id}`, null, null, {
        tweetId: tweet.id,
        tweetText: tweet.text.substring(0, 50) + (tweet.text.length > 50 ? '...' : ''),
        scheduledTime: tweet.runAt,
        attempts: tweet.attempts
      });

      const result = await postTweet(tweet);

      const updates = { attempts: tweet.attempts + 1 };

      if (result.success) {
        if (result.dryRun) {
          updates.status = 'posted';
          updates.postedAt = now.toISOString();
          log('SUCCESS', 'SCHEDULER_TWEET_SUCCESS', 'Tweet processed successfully (DRY_RUN)', null, null, {
            tweetId: tweet.id,
            mode: 'dry_run'
          });
        } else {
          updates.status = 'posted';
          updates.postedAt = now.toISOString();
          updates.tweetId = result.data?.id;
          log('SUCCESS', 'SCHEDULER_TWEET_SUCCESS', 'Tweet posted successfully to Twitter', null, null, {
            tweetId: tweet.id,
            twitterId: result.data?.id,
            attempts: tweet.attempts + 1
          });
        }
        successCount++;
      } else if (result.duplicate) {
        updates.status = 'posted';
        updates.postedAt = now.toISOString();
        log('WARN', 'SCHEDULER_TWEET_DUPLICATE', 'Tweet skipped (duplicate content)', null, null, {
          tweetId: tweet.id,
          reason: 'duplicate_content'
        });
        successCount++;
      } else if (result.rateLimit) {
        updates.nextRetryAt = new Date(now.getTime() + result.resetTime).toISOString();
        log('WARN', 'SCHEDULER_TWEET_RATE_LIMIT', 'Tweet postponed due to rate limit', null, null, {
          tweetId: tweet.id,
          retryIn: Math.ceil(result.resetTime / 1000 / 60) + ' minutes',
          resetTime: result.resetTime
        });
        rateLimitCount++;
      } else {
        if (tweet.attempts >= 4) { // Max 5 attempts (0-4)
          updates.status = 'failed';
          updates.error = result.error;
          updates.failedAt = now.toISOString();
          log('ERROR', 'SCHEDULER_TWEET_FAILED', 'Tweet failed permanently after max attempts', null, null, {
            tweetId: tweet.id,
            attempts: tweet.attempts + 1,
            error: result.error
          });
        } else {
          updates.nextRetryAt = new Date(now.getTime() + (5 * 60 * 1000)).toISOString();
          log('WARN', 'SCHEDULER_TWEET_RETRY', 'Tweet failed, will retry later', null, null, {
            tweetId: tweet.id,
            attempts: tweet.attempts + 1,
            nextRetry: updates.nextRetryAt,
            error: result.error
          });
        }
        errorCount++;
      }

      await updateTweet(tweet.id, updates);
    }

    log('SUCCESS', 'SCHEDULER_COMPLETED', 'Scheduler cycle completed', null, null, {
      processedTweets: dueTweets.length,
      successfulTweets: successCount,
      failedTweets: errorCount,
      rateLimitedTweets: rateLimitCount,
      totalTweets: tweets.length,
      remainingPending: tweets.filter(t => t.status === 'pending').length - dueTweets.length + rateLimitCount
    });

  } catch (error) {
    log('ERROR', 'SCHEDULER_CRASH', 'Scheduler crashed', null, error.message, {
      errorType: error.constructor.name,
      stack: error.stack?.substring(0, 200) + '...'
    });
  }
}

// Initialize and start server
async function startServer() {
  try {
    // Initialize database first
    await initDatabase();

    // Initialize Twitter client
    twitterClient = await initializeTwitterClient();

    // Start scheduler (at the beginning of each minute)
    function scheduleMinuteScheduler() {
      const now = new Date();
      const nextMinute = new Date(now);
      nextMinute.setSeconds(0, 0); // Set to beginning of current minute
      nextMinute.setMinutes(nextMinute.getMinutes() + 1); // Next minute

      const delay = nextMinute - now;

      setTimeout(() => {
        runScheduler();
        // Then run every minute
        setInterval(runScheduler, 60 * 1000);
      }, delay);
    }

    scheduleMinuteScheduler();
    console.log('⏰ Scheduler started (runs at the beginning of each minute)');

    // Start web server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📊 Dashboard: http://localhost:${PORT}`);
      console.log(`🔧 API: http://localhost:${PORT}/api`);
      console.log(`💾 Database: ${dbPath}`);
    });

    // Run scheduler immediately on start
    setTimeout(runScheduler, 1000);

  } catch (error) {
    console.error('Server initialization error:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  process.exit(0);
});

// Start the application
if (require.main === module) {
  startServer();
}

module.exports = app;
