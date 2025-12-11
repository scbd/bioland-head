# Translation Utility Installation Guide

This guide will help you set up the translation utility with AWS Translate and MariaDB caching.

## Prerequisites

- Node.js >= 20.0.0
- MariaDB or MySQL database
- AWS account with Translate API access

## Step 1: Install NPM Dependencies

Add the required packages to your project:

```bash
npm install @aws-sdk/client-translate mariadb
```

Or using yarn:

```bash
yarn add @aws-sdk/client-translate mariadb
```

## Step 2: Configure Environment Variables

Copy the example environment variables to your `.env` file:

```bash
# AWS Configuration for Translation Service
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key

# i18n Cache Database Configuration
I18N_DB_HOST=localhost
I18N_DB_PORT=3306
I18N_DB_USER=your_database_user
I18N_DB_PASSWORD=your_database_password
I18N_DB_NAME=i18n_cache
I18N_DB_CONNECTION_LIMIT=5
```

### AWS Credentials

You can obtain AWS credentials in several ways:

1. **IAM User Credentials**: Create an IAM user with `TranslateReadOnly` or `TranslateFullAccess` policy
2. **AWS CLI Configuration**: The SDK will automatically use credentials from `~/.aws/credentials`
3. **Environment Variables**: As shown above

### Database Configuration

- **I18N_DB_HOST**: Database host (default: localhost)
- **I18N_DB_PORT**: Database port (default: 3306)
- **I18N_DB_USER**: Database username
- **I18N_DB_PASSWORD**: Database password
- **I18N_DB_NAME**: Database name (default: i18n_cache)
- **I18N_DB_CONNECTION_LIMIT**: Max concurrent connections (default: 5)

## Step 3: Create Database Schema

Run the SQL schema file to create the cache database and table:

```bash
mysql -u your_user -p < server/utils/translate/schema.sql
```

Or manually execute:

```sql
CREATE DATABASE IF NOT EXISTS i18n_cache
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE i18n_cache;

CREATE TABLE IF NOT EXISTS i18n_cache (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_locale VARCHAR(10) NOT NULL,
  target_locale VARCHAR(10) NOT NULL,
  cache_key TEXT NOT NULL,
  cache_key_hash VARBINARY(32) GENERATED ALWAYS AS (SHA2(cache_key, 256)) STORED,
  translation_value TEXT NOT NULL,
  is_html TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_translation (source_locale, target_locale, cache_key_hash),
  INDEX idx_cache_lookup (cache_key_hash, source_locale, target_locale)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## Step 4: Verify Installation

Create a test script to verify the setup:

```javascript
// scripts/test-translate.mjs
import { translateText } from './server/utils/translate/index.js'

async function test() {
  try {
    const result = await translateText('Hello, world!', 'fr', 'en')
    console.log('Translation successful:', result)
    process.exit(0)
  } catch (error) {
    console.error('Translation failed:', error)
    process.exit(1)
  }
}

test()
```

Run the test:

```bash
node scripts/test-translate.mjs
```

Expected output:
```
Translation successful: Bonjour le monde!
```

## Step 5: Configure AWS IAM Permissions

Ensure your AWS IAM user/role has the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "translate:TranslateText",
        "translate:TranslateDocument",
        "translate:ListLanguages"
      ],
      "Resource": "*"
    }
  ]
}
```

## Troubleshooting

### Connection Issues

**Problem**: Cannot connect to database
```
Error: connect ECONNREFUSED 127.0.0.1:3306
```

**Solution**:
- Check that MariaDB/MySQL is running
- Verify the host and port in your `.env` file
- Ensure firewall allows connections

### AWS Authentication Issues

**Problem**: Missing credentials
```
Error: Missing credentials in config
```

**Solution**:
- Verify `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set
- Check AWS CLI configuration: `aws configure list`
- Ensure environment variables are loaded properly

### Unsupported Language

**Problem**: Translation fails for certain languages
```
Error: UnsupportedLanguagePairException
```

**Solution**:
- Check supported languages: [AWS Translate Languages](https://docs.aws.amazon.com/translate/latest/dg/what-is-languages.html)
- Use `checkSupportedLocales()` to verify language support

### Database Schema Issues

**Problem**: Table doesn't exist
```
Error: Table 'i18n_cache.i18n_cache' doesn't exist
```

**Solution**:
- Run the schema SQL file again
- Check database name matches your configuration
- Verify user has CREATE TABLE permissions

## Optional: Database Maintenance

### Clean Old Cache Entries

Remove translations older than 90 days:

```sql
DELETE FROM i18n_cache
WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY);
```

### Optimize Table

```sql
OPTIMIZE TABLE i18n_cache;
```

### View Cache Statistics

```sql
SELECT * FROM cache_statistics;
```

## Next Steps

See [README.md](./README.md) for usage examples and API documentation.
