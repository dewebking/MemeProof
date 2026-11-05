# Market data integration audit

## Provider selection and current evidence

- Meme.Cooking remains the identity/launch-metadata source. The market route uses its `token_id` field and the production Meme.Cooking NEAR mainnet feed only. It never treats `meme_id` or numeric Meme.Cooking `pool_id` as a market-provider identifier.
- GeckoTerminal is conditionally preferred. A live `GET https://api.geckoterminal.com/api/v2/networks?page=1` response was retrieved with the expected JSON:API `data` and pagination `links`; page 1 included `aurora`, not native NEAR, and advertised pages 2 and 3. The other pages could not be retrieved by the audit browser, so native NEAR support and an exact GeckoTerminal NEAR network ID remain unconfirmed. The server adapter follows the live pagination links and only enables GeckoTerminal if it finds a network whose reported name is exactly `NEAR`; otherwise it falls back to DEX Screener. It does not equate Aurora with NEAR.
- DEX Screener is configured for chain ID `near`, using `GET /token-pairs/v1/near/{tokenAddress}` followed by `GET /latest/dex/pairs/near/{pairAddress}` for a pair address returned by the token lookup. The code checks chain ID and exact base/quote contract address before accepting a pair. Search is intentionally not used for identity matching.

## Caching, limits, and data gaps

- GeckoTerminal's official API documentation currently describes approximately 10 public requests per minute and one-minute upstream caching. Network discovery is cached by Next.js for six hours; token pools are cached for two minutes.
- DEX Screener's official reference lists 300 requests per minute for token-pair and pair-detail endpoints. Responses are cached for two minutes. No API key is sent by these public adapters.
- The combined application route is cached for one minute with stale-while-revalidate. Provider 429, 5xx, timeout, network, and invalid-JSON failures do not become numeric zeroes; they trigger the configured fallback or an unavailable result.
- An API response is accepted only when its NEAR chain and exact token contract address match the Meme.Cooking `token_id`. DEX Screener reports price/FDV/market cap against the base token; those token-level fields are null when the requested token is only the quote token. Pair-level liquidity, volume, and creation time remain usable when present.
- Provider live pair responses were not verified during the implementation audit because this environment could not fetch those API URLs. The adapters have fixture-based tests, but production availability, GeckoTerminal's native NEAR coverage, and live Meme.Cooking token-to-pair matches remain to be confirmed from a network-enabled deployment.

## Sources

- [GeckoTerminal API reference](https://api.geckoterminal.com/docs/index.html)
- [GeckoTerminal rate limits and public API information](https://support.coingecko.com/articles/6867086195-does-geckoterminal-have-an-api)
- [DEX Screener API reference](https://docs.dexscreener.com/api/reference)
- [DEX Screener NEAR market page](https://dexscreener.com/near)
