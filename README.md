# Remnawave Subscription Page (fork)

A subscription page for [Remnawave Panel](https://remna.st/): it proxies subscription
requests to the panel, serves a web page for browsers and raw configs for VPN clients.

This is a fork of [remnawave/subscription-page](https://github.com/remnawave/subscription-page)
with several extra features:

- **Expired-subscription server injection** — splice a "renew your subscription" notice
  server into the config an expired user receives (Clash/Mihomo/Stash YAML and
  Xray/V2Ray JSON).
- **Marzban legacy links** — old Marzban subscription URLs (JWT or secret-key tokens)
  keep working after a migration to Remnawave.
- **CORS origin allow-list**, **`trust proxy` control**, request param validation
  (global Zod pipe), CI that publishes multi-arch images to Docker Hub.

---

## How it works

```
VPN client / browser
        │  GET /<shortUuid>[/<clientType>]
        ▼
Subscription page (this app, :3010)
        │  1. Marzban legacy token? -> resolve to a Remnawave shortUuid
        │  2. Browser User-Agent?   -> render the web page
        │  3. Otherwise             -> proxy GET {PANEL}/api/sub/<shortUuid>[/<clientType>]
        ▼
Remnawave Panel  (picks the config format by URL suffix or User-Agent / SRR)
        │
        ▼
Subscription page
        │  4. subscription expired? -> inject the notice server (optional)
        ▼
Client receives the config
```

Invalid requests (malformed `shortUuid`, unknown `clientType`) are rejected with `400`
by the global validation pipe; asset probes never reach the panel.

## Quick start (Docker)

Prebuilt multi-arch images are published to Docker Hub:
[`onedockerxxx/remnawave_sub_page`](https://hub.docker.com/r/onedockerxxx/remnawave_sub_page).

```yaml
# docker-compose.yml
services:
  remnawave-subscription-page:
    image: onedockerxxx/remnawave_sub_page:latest
    container_name: remnawave-subscription-page
    hostname: remnawave-subscription-page
    restart: always
    env_file:
      - .env
    ports:
      - '127.0.0.1:3010:3010'
    networks:
      - remnawave-network

networks:
  remnawave-network:
    external: true
```

```bash
cp .env.sample .env
# fill in REMNAWAVE_PANEL_URL, REMNAWAVE_API_TOKEN, INTERNAL_JWT_SECRET
docker compose up -d
```

Prefer `env_file` over inline `environment:` — the injection snippets
(`EXPIRED_SUB_INJECT_*`) are long single-quoted JSON/YAML strings that are painful to
escape in compose YAML. A minimal inline variant without them:

```yaml
    environment:
      - APP_PORT=3010
      - REMNAWAVE_PANEL_URL=https://panel.example.com
      - REMNAWAVE_API_TOKEN=<api token from Dashboard → Settings → API Tokens>
      - INTERNAL_JWT_SECRET=<random hex, see below>
      # only if the panel is behind Cloudflare Zero Trust:
      - CLOUDFLARE_ZERO_TRUST_CLIENT_ID=<id>.access
      - CLOUDFLARE_ZERO_TRUST_CLIENT_SECRET=<secret>
      # expired-subscription notice injection (optional).
      # NOTE: the snippet values contain `: ` and quotes, so the whole
      # `KEY=value` entry must be wrapped in single quotes in compose YAML.
      - EXPIRED_SUB_INJECT_ENABLED=true
      - EXPIRED_SUB_INJECT_MODE=prepend
      - 'EXPIRED_SUB_INJECT_CLASH={name: "⚠️ Subscription expired", type: vless, server: notice.example.com, port: 443, network: tcp, udp: true, uuid: <uuid>, flow: xtls-rprx-vision, tls: true, servername: sni.example.com, reality-opts: {public-key: <pbk>, short-id: "<sid>"}, client-fingerprint: chrome}'
      - 'EXPIRED_SUB_INJECT_CLASH_RULES=["GEOSITE,telegram,⚠️ Subscription expired","GEOIP,telegram,⚠️ Subscription expired,no-resolve","MATCH,DIRECT"]'
      - 'EXPIRED_SUB_INJECT_XRAY={"remarks":"⚠️ Subscription expired","outbounds":[{"tag":"proxy","protocol":"vless","settings":{"vnext":[{"address":"notice.example.com","port":443,"users":[{"id":"<uuid>","encryption":"none","flow":"xtls-rprx-vision"}]}]},"streamSettings":{"network":"tcp","security":"reality","realitySettings":{"serverName":"sni.example.com","publicKey":"<pbk>","shortId":"<sid>","fingerprint":"chrome"}}},{"tag":"direct","protocol":"freedom"},{"tag":"block","protocol":"blackhole"}]}'
```

The page listens on `127.0.0.1:3010` — put your reverse proxy (Caddy/Nginx) in front of it.
To build from source instead, use the `docker-compose.yml` in this repo (`build: .`).
`.env.sample` is fully commented; the tables below describe every variable.

## Environment variables

### Core

| Variable              | Required | Default   | Description                                                                                                                                         |
| --------------------- | -------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REMNAWAVE_PANEL_URL` | yes      | —         | Panel URL, e.g. `http://remnawave:3000` or `https://panel.example.com`                                                                              |
| `REMNAWAVE_API_TOKEN` | yes      | —         | Dashboard → Settings → API Tokens                                                                                                                   |
| `INTERNAL_JWT_SECRET` | yes      | —         | Secret for the session cookie / subpage-config auth. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`           |
| `APP_PORT`            | no       | `3010`    | HTTP port                                                                                                                                           |
| `CUSTOM_SUB_PREFIX`   | no       | —         | Serve under a path prefix, e.g. `sub` (no leading/trailing `/`)                                                                                     |
| `TRUST_PROXY`         | no       | `1`       | Express `trust proxy`: `true`/`false`, hop count, or preset/CIDR list (`loopback`, `172.16.0.0/12`, …). Controls how the real client IP is resolved |
| `CORS_ORIGIN`         | no       | —         | Comma-separated allowed origins; empty = `*`                                                                                                        |
| `SUBPAGE_CONFIG_UUID` | no       | zero UUID | UUID of the subscription-page config (Dashboard → Subscription Page) to use as the default; keep the zero UUID for a single-config setup            |
| `ENABLE_DEBUG_LOGS`   | no       | `false`   | `true` = debug-level logs: per-request panel response body, content-type, expiry decision, Marzban token decoding steps                             |
| `INSTANCE_ID`         | no       | `0`       | Label shown in the log prefix (useful when running several instances)                                                                               |

### Reverse-proxy / panel access add-ons

| Variable                                         | Description                                                                                                                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CADDY_AUTH_API_TOKEN`                           | Sent to the panel as `X-Api-Key` ("Caddy with security" addon / Tiny Auth)                                                                                                       |
| `CLOUDFLARE_ZERO_TRUST_CLIENT_ID` / `..._SECRET` | Sent as `CF-Access-Client-Id/Secret` when the panel sits behind Cloudflare Zero Trust                                                                                            |
| `EGAMES_COOKIE`                                  | Raw `Cookie` header value sent with every panel request (for cookie-gated reverse proxies, e.g. [remnawave-reverse-proxy](https://github.com/eGamesAPI/remnawave-reverse-proxy)) |

### Marzban legacy links

Lets links issued by an old Marzban install keep working: the token from the URL is
decoded (JWT `HS256` or Marzban's base64 + secret-key signature scheme), the username is
looked up in Remnawave and the request is served under the resolved `shortUuid`.

| Variable                                    | Description                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| `MARZBAN_LEGACY_LINK_ENABLED`               | `true`/`false` (default `false`)                                                     |
| `MARZBAN_LEGACY_SECRET_KEY`                 | One or more secret keys, comma-separated (all are tried)                             |
| `MARZBAN_LEGACY_SUBSCRIPTION_VALID_FROM`    | Optional ISO date (`2025-01-17T15:38:45.065Z`): tokens issued before it are rejected |
| `MARZBAN_LEGACY_DROP_REVOKED_SUBSCRIPTIONS` | `true` = reject users whose subscription was revoked in Remnawave                    |

### Expired-subscription server injection

When the panel reports the subscription as expired (the `expire=` timestamp in the
`subscription-userinfo` response header is in the past; `expire=0` / a missing header
never counts as expired), the page splices a "notice" server into the config, so the
user sees why nothing works — e.g. a node named `⚠️ Subscription expired` that only
lets Telegram through so your bot stays reachable.

| Variable                         | Description                                                                                                                                                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPIRED_SUB_INJECT_ENABLED`     | `true`/`false` (default `false`)                                                                                                                                                                                                                   |
| `EXPIRED_SUB_INJECT_MODE`        | `prepend` = notice on top of the real servers; `replace` = only the notice                                                                                                                                                                         |
| `EXPIRED_SUB_INJECT_CLASH`       | A single Clash proxy as inline YAML (must include `name`) — used for Clash/Mihomo/Stash                                                                                                                                                            |
| `EXPIRED_SUB_INJECT_CLASH_RULES` | Optional array of Clash rule strings that **replaces** the global `rules:` section for expired users (rules are global in Clash, this is the only way to ship routing with the notice node). Applied only together with `EXPIRED_SUB_INJECT_CLASH` |
| `EXPIRED_SUB_INJECT_XRAY`        | A single outbound (for `{outbounds}` configs) or a full profile with `remarks` (for array-of-profiles subscriptions: Happ, v2RayTun, Streisand) as JSON                                                                                            |

`replace` keeps the config valid rather than stripping it blindly: in Clash every
proxy-group is pointed at the notice node (and remote providers are dropped); in Xray
infra outbounds (`freedom`, `blackhole`, `dns`) survive so direct routing still works.

Example:

```bash
EXPIRED_SUB_INJECT_ENABLED=true
EXPIRED_SUB_INJECT_MODE=prepend
EXPIRED_SUB_INJECT_CLASH='{name: "⚠️ Subscription expired", type: vless, server: notice.example.com, port: 443, network: tcp, udp: true, uuid: <uuid>, flow: xtls-rprx-vision, tls: true, servername: sni.example.com, reality-opts: {public-key: <pbk>, short-id: "<sid>"}, client-fingerprint: firefox}'
EXPIRED_SUB_INJECT_CLASH_RULES='["GEOSITE,telegram,⚠️ Subscription expired","GEOIP,telegram,⚠️ Subscription expired,no-resolve","MATCH,DIRECT"]'
EXPIRED_SUB_INJECT_XRAY='{"remarks":"⚠️ Subscription expired","outbounds":[{"tag":"proxy","protocol":"vless","settings":{...},"streamSettings":{...}},{"tag":"direct","protocol":"freedom"}]}'
```

#### Which formats get the notice

| Client request                            | Format                         | Snippet used                               |
| ----------------------------------------- | ------------------------------ | ------------------------------------------ |
| `/<shortUuid>/clash`, `/mihomo`, `/stash` | Clash YAML                     | `EXPIRED_SUB_INJECT_CLASH`                 |
| `/<shortUuid>/json`, `/v2ray-json`        | Xray JSON                      | `EXPIRED_SUB_INJECT_XRAY`                  |
| `/<shortUuid>` (no suffix)                | sniffed from the response body | Clash YAML → `_CLASH`, Xray JSON → `_XRAY` |
| sing-box                                  | —                              | passed through untouched (not supported)   |
| base64 link list (`XRAY_BASE64`)          | —                              | passed through untouched (not supported)   |

Injection never breaks a subscription: a malformed snippet or an unrecognised body is
logged and the original config is returned as-is.

#### Panel SRR requirement for v2RayTun / Happ / Streisand

These apps request the **base** subscription URL, so the panel picks the response format
by User-Agent (Subscription Response Rules). By default they fall into the base64
fallback, which the injector skips. To show the notice, add an SRR rule serving
`XRAY_JSON` to them, placed **before** the base64 fallback:

```json
{
  "name": "v2RayTun",
  "enabled": true,
  "operator": "AND",
  "conditions": [
    {
      "headerName": "user-agent",
      "operator": "REGEX",
      "value": "^(v2raytun|happ|streisand)",
      "caseSensitive": false
    }
  ],
  "responseType": "XRAY_JSON"
}
```

## Troubleshooting

**The notice doesn't show up for an expired user:**

1. `EXPIRED_SUB_INJECT_ENABLED=true` and the container was restarted after editing `.env`.
2. Check what the panel actually serves that client — the app decides by response body:

   ```bash
   curl -s https://sub.example.com/<shortUuid> -H 'User-Agent: v2RayTun/2.0' -D -
   ```

   A base64 blob means the client fell into the `XRAY_BASE64` fallback, which is not
   injectable — add an `XRAY_JSON` SRR rule for that app (see above). YAML → needs
   `EXPIRED_SUB_INJECT_CLASH`; JSON → needs `EXPIRED_SUB_INJECT_XRAY`.

3. The user must actually be expired: `subscription-userinfo` header must carry a
   non-zero `expire=` in the past.
4. Set `ENABLE_DEBUG_LOGS=true` — every proxied request logs the panel's content-type,
   body and the `isExpire=` decision, and injection failures are logged with the format.

**Marzban legacy link doesn't resolve:** enable `ENABLE_DEBUG_LOGS=true` — every
decode step (JWT verify, signature check, username lookup) is logged. Remember the
username must exist in Remnawave after sanitization, and all keys from
`MARZBAN_LEGACY_SECRET_KEY` are tried in order.

## Development

```bash
make install        # npm install in backend/ and frontend/
make dev-frontend   # Vite with hot reload on :3334 (mock data)
make build-web      # build frontend into backend/dev_frontend
make dev-backend    # NestJS watch mode on :3010 (serves dev_frontend + real panel data)
make build && make start   # production build / run
```

Tests (Vitest, in `backend/`):

```bash
cd backend
npx vitest run          # unit + e2e (panel mocked)
npm run lint
```

The e2e suite boots the real `AppModule` with the panel replaced by a mock
(`test/utils/create-test-app.ts`) and exercises the full request pipeline, including
param validation. The expired-notice injectors are covered by the unit suites
(`test/unit/subscription-injector*.spec.ts`).

## CI / Docker images

- `ci.yml` — lint + tests + build on every push/PR.
- `build-and-push.yml` — on a version tag, builds multi-arch images and pushes
  [`onedockerxxx/remnawave_sub_page`](https://hub.docker.com/r/onedockerxxx/remnawave_sub_page) to Docker Hub.

Releases: `make bump-patch && make tag-release`.

## Upstream

Based on [remnawave/subscription-page](https://github.com/remnawave/subscription-page).
See the [Remnawave docs](https://remna.st/) for panel setup.
