# Vercel Deployment Protection covers previews only

Protection is a Vercel project setting (`deploymentType` "preview"), not code: production is public at its stable alias, previews sit behind Vercel SSO. A stricter setting once put every URL behind SSO, so each push served the app from a fresh per-deploy origin, storage reset, and testers appeared as a new household every time; it also blocked non-owner household members.

Do not re-tighten protection to cover production without first having a custom domain (a stable origin), or ADR 0003's anonymous identity breaks again. Previews are reached with a shareable link from the Vercel MCP `get_access_to_vercel_url`.
