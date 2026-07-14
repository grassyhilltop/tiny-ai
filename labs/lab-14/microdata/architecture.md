# MegaCorpAI Architecture Overview

## Production environment

- Application servers: `api01.megacorpai.local`, `api02.megacorpai.local`, `api03.megacorpai.local`
- Database: `db-prod.megacorpai.local` (PostgreSQL 15)
- Cache: `redis-prod.megacorpai.local`
- Object store: S3 buckets `megacorpai-prod-uploads`, `megacorpai-prod-backups`

## Staging environment

- One replica of each production service prefixed with `staging-`.
- Staging data is sanitized weekly. Real customer data must never be loaded into staging.

## Internal services

- Identity: Okta tenant `megacorpai.okta.com`
- Source control: GitHub Enterprise at `github.megacorpai.local`
- Wiki: Confluence at `wiki.megacorpai.local`
- Ticketing: JIRA at `jira.megacorpai.local`
