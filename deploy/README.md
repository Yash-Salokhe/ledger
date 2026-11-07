# Deploy Ledger on an IONOS VPS

Everything runs on one Linux server with Docker:

| Container | What it does |
|---|---|
| `caddy` | Public entry point on ports 80/443. Gets and renews the HTTPS certificate automatically. |
| `app` | The Next.js server, connecting as `app_login` (row-level security always applies). |
| `migrate` | Runs once per deploy: applies new migrations and creates the database login roles, then exits. |
| `postgres` | Postgres 16. Not exposed to the internet. Data lives in the `pgdata` volume. |

## 1. Get the server and a domain

1. In IONOS, order a **VPS Linux** with **Ubuntu 24.04**. **VPS S (2 GB RAM)** is the minimum, because building the image needs about 1.5 GB. **VPS M (4 GB)** is better if you can afford it.
2. Choose the data centre closest to your users. IONOS has no India region, so pick Germany or the UK for India and Europe.
3. Point a domain or subdomain at the server: add an **A record** `ledger.yourdomain.com → <VPS IP>`.
4. In the IONOS Cloud Panel firewall, allow inbound **22, 80 and 443** (TCP), plus **443/UDP** for HTTP/3.

## 2. Install Docker on the server

```bash
ssh root@<VPS IP>
curl -fsSL https://get.docker.com | sh
git clone https://github.com/Yash-Salokhe/ledger && cd ledger
```

The repo is private, so cloning needs credentials: a [GitHub deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) or a fine-grained token with read access.

## 3. Configure

```bash
cp deploy/.env.prod.example deploy/.env.prod
for v in POSTGRES_PASSWORD APP_DB_PASSWORD COACH_DB_PASSWORD BETTER_AUTH_SECRET TOKEN_ENCRYPTION_KEY; do
  sed -i "s|^$v=.*|$v=$(openssl rand -hex 32)|" deploy/.env.prod
done
nano deploy/.env.prod     # set DOMAIN, plus RESEND_API_KEY / EMAIL_FROM for real emails
chmod 600 deploy/.env.prod
```

Without `RESEND_API_KEY`, verification codes only appear in `docker compose logs app`. That's fine for a test, but real users need it. [Resend](https://resend.com) is free for 3,000 emails a month; verify your domain there first.

## 4. Start

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
docker compose -f deploy/docker-compose.prod.yml logs -f migrate app   # wait for "migrations up to date"
```

Open `https://ledger.yourdomain.com`. The first visit can take a few seconds while Caddy fetches the certificate.

## Update to a new version

```bash
cd ledger && git pull
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
```

`migrate` runs again, applies only new migrations, then the app restarts.

## Back up the database

Run this nightly with cron, and copy the files off the server (IONOS Cloud Backup, S3, or similar):

```bash
docker compose -f deploy/docker-compose.prod.yml exec -T postgres \
  pg_dump -U ledger_owner -Fc ledger > /root/backups/ledger-$(date +%F).dump
```

Restore with `pg_restore -U ledger_owner -d ledger --clean <file>` inside the postgres container.

## Google and Apple sign-in

Each button appears once its keys are set in `deploy/.env.prod`. Then run the `up -d` command again.

- **Google:** Google Cloud Console → Credentials → OAuth client (Web). Redirect URI: `https://<DOMAIN>/api/auth/callback/google`.
- **Apple:** needs a paid Apple Developer account. Return URL: `https://<DOMAIN>/api/auth/callback/apple`.

## When one VPS isn't enough

This setup comfortably serves a portfolio launch and the first few thousand users. For lakhs of users, the plan in `docs/ARCHITECTURE.md` applies:

- move Postgres to a managed service with backups and a read replica, in an India region for Indian users
- run 2+ app containers behind a load balancer, adding PgBouncer between them and the database
- serve static assets from a CDN

The app is already stateless, so none of this needs code changes.
