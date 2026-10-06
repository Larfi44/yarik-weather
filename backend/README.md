# Backend (legacy, opt-in)

> **Not required.** The website gets its data straight from api-ninjas in the
> browser (see `../frontend/README.md`). This Rust service is kept for the day a
> self-hosted API is deployed again; the Yandex Cloud containers it used to
> live in no longer exist, so `../scripts/build-and-deploy-backend.sh` will fail
> until the registry/account details are updated.

What is here:

- `src/` — Axum/Tokio service exposing `GET /?city=<name>` and returning the
  `WeatherResponse` JSON the frontend was originally written against.
- `ai/` — the Python "AI weather" helper container.
- `Dockerfile`, `Cargo.toml` — images built for `cr.yandex/...` and deployed
  with `yc serverless container revision deploy` (Yandex Cloud specific).

## Using it from the site

Point the client at a running instance at runtime:

```
https://<site>/?api=http://localhost:8081
```

or programmatically:

```js
YW.api.setApiUrl('http://localhost:8081'); // '' goes back to api-ninjas
```

Or run it locally while developing:

```bash
cd backend && cargo run            # serves on http://localhost:8081
./frontend/scripts/dev.sh 3000     # separate terminal
# open http://localhost:3000/?api=http://localhost:8081
```

`frontend/scripts/test-api.js` covers the legacy transport too (section 4) and
reports "no longer exists" when the configured deployment is dead.
