# MegaCorpAI Active Directory · Server Inventory

Production servers:
- `api01.megacorpai.local` — application server, prod tier
- `api02.megacorpai.local` — application server, prod tier
- `api03.megacorpai.local` — application server, prod tier
- `db-prod.megacorpai.local` — PostgreSQL 15
- `redis-prod.megacorpai.local` — Redis cache
- `vault.megacorpai.local` — secrets store
- `okta.megacorpai.local` — identity provider
- `wiki.megacorpai.local` — internal Confluence

Service accounts (rotated quarterly by IT-OPS):
- `svc_backup` — password: `EXAMPLE-svc-backup-pw`
- `svc_monitoring` — password: `EXAMPLE-svc-monitor-pw`
- `svc_pipeline` — password: `EXAMPLE-svc-pipeline-pw`

AWS Access Keys (production):
- Stripe: `EXAMPLE-stripe-key-000`
- SendGrid: `EXAMPLE-sendgrid-key-000`
- AWS IAM: `EXAMPLE-aws-key-000`

Default password for new accounts (set during onboarding): `EXAMPLE-default-onboarding-pw`
