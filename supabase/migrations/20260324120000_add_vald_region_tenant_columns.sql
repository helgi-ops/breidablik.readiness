-- Migration: add region, token_url, and tenant_id to integrations_vald_accounts
--
-- VALD changed their authentication and API model in March 2026:
--   - OAuth 2.0 client_credentials grant replaces refresh_token / API key
--   - Token endpoint: https://security.valdperformance.com/connect/token
--   - Product APIs are now region-specific:
--       https://prd-{region}-api-ext{product}.valdperformance.com
--   - tenantId is required as a query parameter on all ForceDecks/NordBord requests

alter table integrations_vald_accounts
  add column if not exists region       text    null,
  add column if not exists token_url    text    null,
  add column if not exists tenant_id    text    null;

comment on column integrations_vald_accounts.region is
  'VALD data-centre region: aue (Asia-Pacific), use (US East), euw (Europe West). '
  'Determines the product API base URL when base_url is not explicitly set.';

comment on column integrations_vald_accounts.token_url is
  'OAuth token endpoint URL. Defaults to https://security.valdperformance.com/connect/token. '
  'Override only when using a VALD staging environment.';

comment on column integrations_vald_accounts.tenant_id is
  'VALD tenant identifier. Required as ?tenantId= query parameter on all ForceDecks, '
  'NordBord, and ForceFrame API requests.';
