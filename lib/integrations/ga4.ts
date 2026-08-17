// TODO(Phase 1): port + adapt the GA4 fetcher from the previous build's integrations.ts —
// including the AI-referral-traffic session-source filter (chatgpt.com, gemini.google.com,
// claude.ai, perplexity.ai, copilot.microsoft.com, bing.com), which is already built and just
// needs porting per brand.
//
// Auth uses the single shared access@hueston.co refresh token (see shared_credentials table
// and the setup guide for how that token gets minted).

export async function syncGa4ForBrand(brandId: string, date: string) {
  throw new Error("not implemented yet");
}
