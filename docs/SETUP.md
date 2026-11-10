# Setup and deployment

## Runtime boundary

This project uses Vinext/Vite, React, Cloudflare Workers and D1. It retains the Sites development bridge and trusted identity-header contract from the original application. GitHub hosts source code; GitHub Pages cannot run the server or database.

1. Install Node >=22.13 and the recorded pnpm version from package.json.
2. Run pnpm install --frozen-lockfile.
3. Copy .env.example to an ignored .env.local and populate it through your supported hosting environment. Never commit the populated file.
4. Initialize a fresh database using drizzle/0000_lethal_the_professor.sql. For local Wrangler development, the equivalent command is: pnpm exec wrangler d1 execute DB --local --file drizzle/0000_lethal_the_professor.sql --config <your-generated-worker-config>. The configuration path depends on the hosting adapter.
5. Set CONFIG_ENCRYPTION_KEY to a securely generated 32-byte value encoded as exactly 64 hexadecimal characters.
6. Set DESK_OWNER_EMAIL to the trusted owner identity. The built-in local preview identity is seedy@sites.test; use that value only for an isolated local preview if owner actions are needed.
7. Keep TRADING_VIEWER_TELEGRAM_DISABLED=true unless viewer delivery is deliberately configured. TELEGRAM_VIEWER_EMAIL is optional and starts empty.
8. Run pnpm check, then pnpm dev. The preview listens on port 5173.

## Production

Register your own Sites project or adapt the worker to your Cloudflare account. Replace the placeholder project_id in .openai/hosting.json with the new deployment's ID and bind a fresh D1 database as DB. Store secrets in the deployment secret store.

The authentication boundary must strip untrusted oai-authenticated-user-* headers and supply verified identity. Do not expose the worker with spoofable client-supplied identity headers. The checked-in preview sign-in mock is for local development only.

The deployment's data, users, access rules and schedules are not included in this repository. Publishing code does not deploy the application or reactivate the original installation.

## Data and Telegram

Provide your own Twelve Data API key, then choose provider symbol mappings explicitly. Mappings start blank. Add your own bot token, start the bot, and select your private Telegram chat in Connections.

Report operations have side effects: they may request provider data and send Telegram messages. No external scheduler is included. The schedule flag displayed by the application is not an authoritative view of external scheduling.

## Build verification

Use pnpm build in a compatible environment after installing native dependencies for that machine. The package passed TypeScript checks here, but this Mac host rejected the cached Rolldown native binding on code-signature grounds. No production build or new deployment was completed during this handoff.
