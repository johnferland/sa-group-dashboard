// TODO(Phase 1): port + adapt the Search Console fetcher from the previous build's
// integrations.ts. This is now the sole source for the SEO section (no Ahrefs).
//
// Auth uses the single shared access@hueston.co refresh token (see shared_credentials table
// and the setup guide for how that token gets minted).

export async function syncGscForBrand(brandId: string, date: string) {
  throw new Error("not implemented yet");
}
