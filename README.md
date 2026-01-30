# X (Twitter) API Post Planner

X (Twitter) API v2 ile OAuth 1.1a kullanarak zamanlanmış tweet gönderimi yapan Node.js uygulaması.

**🎉 TAMAMEN OTOMATİK - Artık manuel access token almanıza gerek yok!**

## Özellikler

- ✅ **Premium Modern Dashboard** - X platformu renk paleti ile siyah gradient tasarım
- ✅ **SQLite Veritabanı** - Kalıcı veri saklama, sistem yeniden başlatıldığında veriler korunur
- ✅ OAuth 1.1a authentication (Daha basit ve stabil)
- ✅ Zamanlanmış tweet gönderimi (İstanbul saati +03:00)
- ✅ Dakika başına scheduler (dakika sınırlarında çalışır)
- ✅ **Rate Limit Takibi** - Günlük 150, saatlik 25, dakikalık 3 tweet limiti
- ✅ **Kalıcı Rate Limit** - Sistem kapatılıp açıldığında limitler korunur
- ✅ Idempotency (çift gönderim engelleme - hash-based)
- ✅ Gerçek zamanlı güncellemeler (30 saniyede bir)
- ✅ Gelişmiş log sistemi (JSON format + basit rotation)
- ✅ DRY_RUN modu (test için)
- ✅ RESTful API endpoints
- ✅ İnteraktif emoji butonları ve akıllı karakter sayacı
- ✅ Gradient animasyonlar ve hover efektleri
- ✅ Responsive tasarım (mobil uyumlu)
- ✅ Graceful shutdown ve error handling

## Gereksinimler

- Node.js 20 LTS veya üzeri
- X (Twitter) Developer Account
- **SQLite** - Otomatik kurulur (paket bağımlılığı olarak dahil)

## 📊 Veritabanı Bilgileri

Bu proje **SQLite** veritabanı kullanır:

- **Dosya:** `x-scheduler.db`
- **Konum:** Proje ana dizininde
- **İçerik:**
  - `tweets` tablosu: Tweet bilgileri
  - `rate_limits` tablosu: Kullanım limitleri

### Veritabanı Özellikleri

- ✅ **Kalıcı Saklama** - Sistem kapatılıp açıldığında veriler korunur
- ✅ **Rate Limit Takibi** - Günlük, saatlik, dakikalık kullanımlar kaydedilir
- ✅ **Otomatik Backup** - Eski JSON verileri `schedule.json.backup` olarak saklanır
- ✅ **Migration Desteği** - Eski JSON verileri otomatik olarak SQLite'a aktarılır

### Rate Limit Yapısı

```sql
-- Günlük limit: 150 tweet
-- Saatlik limit: 25 tweet
-- Dakikalık limit: 3 tweet

-- Örnek kayıtlar:
-- daily: '2025-09-08' → used: 45
-- hourly: '2025-09-08-14' → used: 8
-- minute: '2025-09-08-14-30' → used: 2
```
- Uygulama API anahtarları

## Kurulum (10 Dakika)

### 1. Repository'yi Klonlayın
```bash
git clone <repository-url>
cd x-api-post-planner
```

### 2. Bağımlılıkları Yükleyin
```bash
npm install
```

### 3. X Developer Portal'dan API Anahtarlarını Alın

1. [X Developer Portal](https://developer.twitter.com/en/portal/dashboard)'a gidin
2. Yeni bir uygulama oluşturun
3. **Authentication settings** bölümünde:
   - OAuth 2.0'ı etkinleştirin
   - Scopes: `tweet.read`, `users.read`, `tweet.write`, `offline.access`
   - Callback URL: `http://localhost:3000/callback` (veya istediğiniz URL)

### 4. Environment Variables Ayarlayın

`.env.example` dosyasını `.env` olarak kopyalayın:

```bash
cp .env.example .env
```

`.env` dosyasını düzenleyin:
```env
# X Developer Portal'dan aldığınız değerler
TWITTER_API_KEY=your_api_key_here
TWITTER_API_SECRET=your_api_secret_here
TWITTER_ACCESS_TOKEN=your_access_token_here
TWITTER_ACCESS_SECRET=your_access_secret_here

# Test için true, canlı kullanım için false
DRY_RUN=true
LOG_LEVEL=info
TIMEZONE=Europe/Istanbul
```

### 5. API Anahtarlarını Alın

**⚡ Sadece 5 Dakika Sürer!**

1. [X Developer Portal](https://developer.twitter.com/en/portal/dashboard)'a gidin
2. Mevcut projenizi seçin (veya yeni proje oluşturun)
3. Sol menüden **Keys and tokens**'a tıklayın
4. Aşağıdaki 4 anahtarı kopyalayın:

   **API Key** (Consumer Key) - Örnek: `ABC123...`
   **API Key Secret** (Consumer Secret) - Örnek: `XYZ789...`
   **Access Token** - Örnek: `123456789-ABC...`
   **Access Token Secret** - Örnek: `DEF456...`

5. Bu anahtarları `.env` dosyanızda ilgili alanlara yapıştırın:

```env
TWITTER_API_KEY=ABC123...
TWITTER_API_SECRET=XYZ789...
TWITTER_ACCESS_TOKEN=123456789-ABC...
TWITTER_ACCESS_SECRET=DEF456...
```

**🎯 Önemli:** Bu anahtarlar bir kez alınır ve sonsuza kadar geçerlidir!

### 6. Sistemi Test Edin

```bash
# Sistemi başlatın (SQLite otomatik oluşturulur)
npm start

# Tarayıcıda http://localhost:3000 adresine gidin
```

Sistem ilk çalıştığında:
- ✅ `x-scheduler.db` SQLite veritabanı otomatik oluşturulur
- ✅ Gerekli tablolar otomatik oluşturulur
- ✅ Eski `schedule.json` varsa otomatik olarak SQLite'a aktarılır
- ✅ Rate limit sistemi aktif hale gelir

### 7. Tweet Ekleyin ve Otomatik Gönderin

```bash
# Web paneli üzerinden kolayca tweet ekleyin
# Dashboard: http://localhost:3000

# Özellikler:
✅ Tarih/saat seçimi (İstanbul saati)
✅ Emoji butonları
✅ Karakter sayacı
✅ Otomatik scheduler (dakika başında çalışır)
✅ Rate limit kontrolü
✅ Gerçek zamanlı güncellemeler
```

### 📈 Rate Limit Bilgileri

- **Günlük Limit:** 150 tweet
- **Saatlik Limit:** 25 tweet
- **Dakikalık Limit:** 3 tweet

Bu limitler **veritabanında saklanır** ve sistem kapatılıp açıldığında **korunur**.

## 📋 Detaylı Log Sistemi

Sistem tüm işlemleri detaylı bir şekilde `scheduler.log` dosyasına kaydeder:

### Log Format Örneği
```
[09.09.2025 02:29:02] ✅ SUCCESS: TWEET_POSTED → Tweet posted successfully to Twitter
   💬 Tweet: "Merhaba dünya! #test"
   🆔 Tweet ID: abc123
   🐦 Twitter ID: 1965143218296693155
   🔄 Attempt: 1
   📊 Daily Limit: 1/150 (149 remaining)
   ──────────────────────────────────────────────────
```

### Log Tipleri
- **✅ SUCCESS**: Başarılı işlemler (tweet gönderimi, veritabanı işlemleri)
- **📋 INFO**: Bilgilendirme (scheduler çalışması, durum kontrolü)
- **⚠️ WARN**: Uyarılar (rate limit, duplicate içerik)
- **❌ ERROR**: Hatalar (API hatası, veritabanı hatası)
- **🔍 DEBUG**: Debug bilgileri (detaylı işlem takibi)

### Log İçeriği
- İstanbul saati ile zaman damgası
- İşlem türü ve açıklaması
- Tweet metni (100 karakter ile sınırlı)
- Tweet ID'leri ve durum bilgileri
- Rate limit kullanımı
- Hata detayları ve çözüm önerileri

## 🎨 Dashboard Özellikleri

### 📊 İstatistikler
- Toplam, bekleyen, gönderilen ve başarısız tweet sayıları
- Günlük/haftalık rate limit gösterimi
- Otomatik sayı animasyonları

### ⏰ Tweet Yönetimi
- Kolay tarih/saat seçimi (İstanbul saati)
- Emoji butonları ile hızlı ekleme
- Karakter sayacı (280 karakter)
- Tweet düzenleme ve silme

### 🔄 Otomatik Özellikler
- **Dakika başına scheduler**: Her dakikanın başında çalışır
- **Gerçek zamanlı güncellemeler**: 30 saniyede bir otomatik yenileme
- **Akıllı status göstergeleri**: Bekliyor/Zamanı Geçti/Gönderildi/Başarısız
- **Rate limit koruması**: Otomatik retry ve limit kontrolü

### 🎯 Akıllı Zamanlama
- 23:06:37'de çalıştırılırsa → 23:07:00'da tweet atar
- Geçmiş tarihler için otomatik yarın ayarlama
- İstanbul timezone desteği (+03:00)

## 🔍 Sorun Giderme

### Log Dosyası İnceleme
```bash
# Son log kayıtlarını görüntüleme
tail -20 scheduler.log

# Belirli bir tarihteki logları arama
grep "2025-09-08" scheduler.log

# Hata loglarını görüntüleme
grep "ERROR" scheduler.log
```

### Veritabanı Kontrolü
```bash
# SQLite veritabanını açma
sqlite3 x-scheduler.db

# Tweet'leri listeleme
SELECT * FROM tweets;

# Rate limit geçmişini görüntüleme
SELECT * FROM rate_limits ORDER BY updatedAt DESC;

# Veritabanından çıkma
.exit
```

### Yaygın Sorunlar

**Rate Limit Hatası:**
- Log'da "Rate limit exceeded" mesajını kontrol edin
- Rate limit tablolarını temizleyin: `DELETE FROM rate_limits;`

**Tweet Gönderilemiyor:**
- Twitter API anahtarlarını kontrol edin
- Log'da API hata mesajlarını inceleyin

**Veritabanı Hatası:**
- `x-scheduler.db` dosyasının yazılabilir olduğundan emin olun
- Eski dosyayı yedekleyip yeniden oluşturun

## 📊 Sistem Performansı

- **Ortalama Response Time**: < 100ms
- **Memory Usage**: < 50MB
- **Database Size**: Tweet başına ~1KB
- **Log Rotation**: 1MB'da otomatik yedek

## 🔐 Güvenlik

- API anahtarları local `.env` dosyasında saklanır
- Veritabanı şifrelenmemiş (güvenli kullanım için VPN kullanın)
- Log dosyalarında tweet içerikleri kısaltılmış şekilde kaydedilir

## 🚀 İleri Özellikler

- [ ] Webhook desteği
- [ ] Email bildirimleri
- [ ] Tweet taslakları
- [ ] Analytics dashboard
- [ ] API rate limit monitoring

**🚀 Sistem artık tamamen otomatik, detaylı log sistemi ile izlenebilir ve SQLite veritabanı ile kalıcı!**

## Kullanım

### Zamanlama Formatı

`schedule.json` dosyasında tweet'leri şu formatta tanımlayın:

```json
[
  {
    "id": "uuid-1",
    "runAt": "2025-09-15T10:00:00+03:00",
    "text": "Merhaba dünya! #test",
    "status": "pending",
    "attempts": 0
  }
]
```

### Cron ile Otomatik Çalıştırma

```bash
# Her 5 dakikada bir çalıştır
*/5 * * * * cd /path/to/x-api-post-planner && npm start
```

### Tweet Ekleme

Kolay tweet ekleme için yardımcı script kullanın:

```bash
# Bugünün istediğiniz saatine tweet ekleme
node add-tweet.js "Tweet metniniz buraya" HH:mm

# Örnekler:
node add-tweet.js "Sabah kahvaltısı ☕" 08:30
node add-tweet.js "Akşam toplantısı hatırlatması 📅" 19:12
node add-tweet.js "Hafta sonu planları 🎉" 10:00
```

### Manuel Çalıştırma

```bash
# Tek seferlik çalıştırma
npm start

# Test modu
DRY_RUN=true npm start
```

## Log Sistemi

Loglar `scheduler.log` dosyasında JSON formatında saklanır:

```json
{
  "timestamp": "2025-09-15T10:00:00.000Z",
  "level": "info",
  "action": "TWEET_POSTED",
  "result": "Tweet ID: 1234567890",
  "error": null,
  "tweetId": "uuid-1",
  "twitterId": "1234567890"
}
```

## MVP Kabul Ölçütleri

✅ **1. Zamanlanmış Gönderim**: DRY_RUN=false ile doğru saatte 201 döner
✅ **2. Rate Limit Handling**: 429/5xx hatalarında backoff + retry çalışır
✅ **3. Kalıcı JSON**: Yeniden başlatmada bekleyen kayıtlar kaybolmaz
✅ **4. Idempotency**: Aynı içerik ikinci kez gönderilmez
✅ **5. 10 Dakika Kurulumu**: README ile kolay kurulum

## Troubleshooting

### 403 Forbidden Hatası
- OAuth 2.0 scopes'larının doğru ayarlandığından emin olun
- Refresh token'ın geçerli olduğundan emin olun

### 429 Rate Limit
- Exponential backoff otomatik olarak çalışır
- Log dosyasında retry'ları görebilirsiniz

### Tarih Formatı
- `+03:00` timezone bilgisi zorunludur
- Europe/Istanbul timezone otomatik olarak uygulanır

## Güvenlik

- `.env` dosyasını asla commit etmeyin
- Refresh token'ı güvenli bir yerde saklayın
- Production kullanımında environment variable'ları kullanın

## Lisans

ISC License

---

# X (Twitter) API Post Planner (English)

Node.js application for scheduled tweet posting using X (Twitter) API v2 with OAuth 1.1a.

**🎉 FULLY AUTOMATIC - No need to obtain access tokens manually anymore!**

## Features

- ✅ **Premium Modern Dashboard** - Black gradient design with X platform color palette
- ✅ **SQLite Database** - Persistent data storage, data preserved on system restart
- ✅ OAuth 1.1a authentication (Simpler and more stable)
- ✅ Scheduled tweet posting (Istanbul time +03:00)
- ✅ Per-minute scheduler (runs on minute boundaries)
- ✅ **Rate Limit Tracking** - Daily 150, hourly 25, per-minute 3 tweet limits
- ✅ **Persistent Rate Limits** - Limits preserved when system is restarted
- ✅ Idempotency (duplicate posting prevention - hash-based)
- ✅ Real-time updates (every 30 seconds)
- ✅ Advanced logging (JSON format + simple rotation)
- ✅ DRY_RUN mode (for testing)
- ✅ RESTful API endpoints
- ✅ Interactive emoji buttons and smart character counter
- ✅ Gradient animations and hover effects
- ✅ Responsive design (mobile-friendly)
- ✅ Graceful shutdown and error handling

## Requirements

- Node.js 20 LTS or higher
- X (Twitter) Developer Account
- **SQLite** - Installed automatically (included as package dependency)

## 📊 Database Information

This project uses **SQLite** database:

- **File:** `x-scheduler.db`
- **Location:** Project root directory
- **Contents:**
  - `tweets` table: Tweet information
  - `rate_limits` table: Usage limits

### Database Features

- ✅ **Persistent Storage** - Data preserved when system is restarted
- ✅ **Rate Limit Tracking** - Daily, hourly, per-minute usage recorded
- ✅ **Automatic Backup** - Old JSON data saved as `schedule.json.backup`
- ✅ **Migration Support** - Old JSON data automatically migrated to SQLite

### Rate Limit Structure

```sql
-- Daily limit: 150 tweets
-- Hourly limit: 25 tweets
-- Per-minute limit: 3 tweets

-- Example records:
-- daily: '2025-09-08' → used: 45
-- hourly: '2025-09-08-14' → used: 8
-- minute: '2025-09-08-14-30' → used: 2
```

## Installation (10 Minutes)

### 1. Clone the Repository
```bash
git clone <repository-url>
cd x-api-post-planner
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Get API Keys from X Developer Portal

1. Go to [X Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Create a new application
3. In **Authentication settings**:
   - Enable OAuth 2.0
   - Scopes: `tweet.read`, `users.read`, `tweet.write`, `offline.access`
   - Callback URL: `http://localhost:3000/callback` (or your preferred URL)

### 4. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit the `.env` file:
```env
# Values from X Developer Portal
TWITTER_API_KEY=your_api_key_here
TWITTER_API_SECRET=your_api_secret_here
TWITTER_ACCESS_TOKEN=your_access_token_here
TWITTER_ACCESS_SECRET=your_access_secret_here

# true for testing, false for production
DRY_RUN=true
LOG_LEVEL=info
TIMEZONE=Europe/Istanbul
```

### 5. Get API Keys

**⚡ Takes Only 5 Minutes!**

1. Go to [X Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Select your project (or create a new one)
3. Click **Keys and tokens** in the left menu
4. Copy these 4 keys:

   **API Key** (Consumer Key) - Example: `ABC123...`
   **API Key Secret** (Consumer Secret) - Example: `XYZ789...`
   **Access Token** - Example: `123456789-ABC...`
   **Access Token Secret** - Example: `DEF456...`

5. Paste these keys into the corresponding fields in your `.env` file:

```env
TWITTER_API_KEY=ABC123...
TWITTER_API_SECRET=XYZ789...
TWITTER_ACCESS_TOKEN=123456789-ABC...
TWITTER_ACCESS_SECRET=DEF456...
```

**🎯 Important:** These keys are obtained once and are valid indefinitely!

### 6. Test the System

```bash
# Start the system (SQLite is created automatically)
npm start

# Open http://localhost:3000 in your browser
```

When the system runs for the first time:
- ✅ `x-scheduler.db` SQLite database is created automatically
- ✅ Required tables are created automatically
- ✅ Existing `schedule.json` is migrated to SQLite automatically
- ✅ Rate limit system becomes active

### 7. Add Tweets and Post Automatically

```bash
# Add tweets easily via the web panel
# Dashboard: http://localhost:3000

# Features:
✅ Date/time selection (Istanbul time)
✅ Emoji buttons
✅ Character counter
✅ Automatic scheduler (runs at minute start)
✅ Rate limit control
✅ Real-time updates
```

### 📈 Rate Limit Information

- **Daily Limit:** 150 tweets
- **Hourly Limit:** 25 tweets
- **Per-Minute Limit:** 3 tweets

These limits are **stored in the database** and **preserved** when the system is restarted.

## 📋 Detailed Logging System

The system logs all operations in detail to the `scheduler.log` file:

### Log Format Example
```
[09.09.2025 02:29:02] ✅ SUCCESS: TWEET_POSTED → Tweet posted successfully to Twitter
   💬 Tweet: "Hello world! #test"
   🆔 Tweet ID: abc123
   🐦 Twitter ID: 1965143218296693155
   🔄 Attempt: 1
   📊 Daily Limit: 1/150 (149 remaining)
   ──────────────────────────────────────────────────
```

### Log Types
- **✅ SUCCESS**: Successful operations (tweet posting, database operations)
- **📋 INFO**: Information (scheduler run, status check)
- **⚠️ WARN**: Warnings (rate limit, duplicate content)
- **❌ ERROR**: Errors (API error, database error)
- **🔍 DEBUG**: Debug information (detailed operation tracking)

### Log Content
- Timestamp in Istanbul time
- Operation type and description
- Tweet text (limited to 100 characters)
- Tweet IDs and status information
- Rate limit usage
- Error details and solution suggestions

## 🎨 Dashboard Features

### 📊 Statistics
- Total, pending, posted, and failed tweet counts
- Daily/weekly rate limit display
- Automatic number animations

### ⏰ Tweet Management
- Easy date/time selection (Istanbul time)
- Quick insertion with emoji buttons
- Character counter (280 characters)
- Tweet edit and delete

### 🔄 Automatic Features
- **Per-minute scheduler**: Runs at the start of each minute
- **Real-time updates**: Auto-refresh every 30 seconds
- **Smart status indicators**: Pending/Overdue/Posted/Failed
- **Rate limit protection**: Automatic retry and limit checking

### 🎯 Smart Scheduling
- If run at 23:06:37 → posts at 23:07:00
- Automatic tomorrow setting for past dates
- Istanbul timezone support (+03:00)

## 🔍 Troubleshooting

### Viewing Log File
```bash
# View last log entries
tail -20 scheduler.log

# Search logs for a specific date
grep "2025-09-08" scheduler.log

# View error logs
grep "ERROR" scheduler.log
```

### Database Check
```bash
# Open SQLite database
sqlite3 x-scheduler.db

# List tweets
SELECT * FROM tweets;

# View rate limit history
SELECT * FROM rate_limits ORDER BY updatedAt DESC;

# Exit database
.exit
```

### Common Issues

**Rate Limit Error:**
- Check for "Rate limit exceeded" message in logs
- Clear rate limit tables: `DELETE FROM rate_limits;`

**Tweet Not Posting:**
- Verify Twitter API keys
- Check API error messages in logs

**Database Error:**
- Ensure `x-scheduler.db` is writable
- Backup old file and recreate

## 📊 System Performance

- **Average Response Time**: < 100ms
- **Memory Usage**: < 50MB
- **Database Size**: ~1KB per tweet
- **Log Rotation**: Automatic backup at 1MB

## 🔐 Security

- API keys stored in local `.env` file
- Database is unencrypted (use VPN for secure usage)
- Tweet contents in log files are stored in truncated form

## 🚀 Future Features

- [ ] Webhook support
- [ ] Email notifications
- [ ] Tweet drafts
- [ ] Analytics dashboard
- [ ] API rate limit monitoring

**🚀 System is fully automatic, traceable with detailed logging, and persistent with SQLite database!**

## Usage

### Schedule Format

Define tweets in `schedule.json` in this format:

```json
[
  {
    "id": "uuid-1",
    "runAt": "2025-09-15T10:00:00+03:00",
    "text": "Hello world! #test",
    "status": "pending",
    "attempts": 0
  }
]
```

### Run Automatically with Cron

```bash
# Run every 5 minutes
*/5 * * * * cd /path/to/x-api-post-planner && npm start
```

### Adding Tweets

Use the helper script for easy tweet addition:

```bash
# Add tweet at desired time today
node add-tweet.js "Your tweet text here" HH:mm

# Examples:
node add-tweet.js "Morning coffee ☕" 08:30
node add-tweet.js "Evening meeting reminder 📅" 19:12
node add-tweet.js "Weekend plans 🎉" 10:00
```

### Manual Run

```bash
# One-time run
npm start

# Test mode
DRY_RUN=true npm start
```

## Log System

Logs are stored in JSON format in `scheduler.log`:

```json
{
  "timestamp": "2025-09-15T10:00:00.000Z",
  "level": "info",
  "action": "TWEET_POSTED",
  "result": "Tweet ID: 1234567890",
  "error": null,
  "tweetId": "uuid-1",
  "twitterId": "1234567890"
}
```

## MVP Acceptance Criteria

✅ **1. Scheduled Posting**: Returns 201 at correct time with DRY_RUN=false
✅ **2. Rate Limit Handling**: Backoff + retry on 429/5xx errors
✅ **3. Persistent JSON**: Pending records not lost on restart
✅ **4. Idempotency**: Same content not posted twice
✅ **5. 10-Minute Setup**: Easy setup with README

## Troubleshooting

### 403 Forbidden Error
- Ensure OAuth 2.0 scopes are configured correctly
- Ensure refresh token is valid

### 429 Rate Limit
- Exponential backoff runs automatically
- Retries visible in log file

### Date Format
- `+03:00` timezone is required
- Europe/Istanbul timezone applied automatically

## Security

- Never commit `.env` file
- Store refresh token securely
- Use environment variables in production

## License

ISC License
