import { supabase } from "./supabase";

// Sponsor Store — the in-app marketplace of sponsor products (link-out for now).
// Served by store_products() (approved + active products of active sponsors).
export type StoreProduct = {
  id: string; sponsorId: string; sponsorName: string; sponsorLogo: string | null;
  name: string; description: string | null; imageUrl: string | null; priceDisplay: string | null; productUrl: string;
};

export async function storeProducts(): Promise<StoreProduct[]> {
  const { data, error } = await supabase.rpc("store_products");
  if (error || !data) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((p) => ({
    id: p.id, sponsorId: p.sponsor_id, sponsorName: p.sponsor_name, sponsorLogo: p.sponsor_logo ?? null,
    name: p.name, description: p.description ?? null, imageUrl: p.image_url ?? null,
    priceDisplay: p.price_display ?? null, productUrl: p.product_url,
  }));
}

// Fire-and-forget click tracking (ad "Learn more" or a store product).
export async function sponsorClick(kind: "ad_click" | "product_click", opts: { adId?: string; productId?: string }): Promise<void> {
  try { await supabase.rpc("sponsor_click", { p_kind: kind, p_ad: opts.adId ?? null, p_product: opts.productId ?? null }); } catch { /* best-effort */ }
}
