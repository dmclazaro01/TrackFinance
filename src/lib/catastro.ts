import "server-only";

// Free official web service of the Spanish Cadastre (Sede Electrónica del
// Catastro). No API key required. Docs: pris.ly-style PDF "Webservices_Libres".
const BASE =
  "https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json";

export type CatastroData = {
  refCat: string;
  surfaceM2: number;
  province: string; // e.g. "MADRID"
  municipality: string;
  use: string | null; // luso: "Vivienda", "Oficinas", …
  address: string; // ldt (full descriptive address)
};

/** Normalize a cadastral reference: strip spaces, upper-case. */
export function normalizeRefCat(rc: string): string {
  return rc.replace(/\s+/g, "").toUpperCase();
}

function toNumber(sfc: unknown): number {
  if (typeof sfc !== "string") return 0;
  // Catastro returns e.g. "3.276" (thousands) or "899" — keep digits only.
  const n = parseInt(sfc.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Fetch surface (m²) and location for an exact cadastral reference.
 * Returns null when the reference is invalid or the service errors.
 */
export async function getCatastroData(refCatRaw: string): Promise<CatastroData | null> {
  const refCat = normalizeRefCat(refCatRaw);
  if (refCat.length < 14) return null;

  try {
    const res = await fetch(
      `${BASE}/Consulta_DNPRC?RefCat=${encodeURIComponent(refCat)}`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    const result = json?.consulta_dnprcResult as Record<string, unknown> | undefined;
    if (!result) return null;
    // Error envelope: { lerr: [{ des }] }
    if (result.lerr) return null;

    const bi = (result.bico as Record<string, unknown> | undefined)?.bi as
      | Record<string, unknown>
      | undefined;
    if (!bi) return null;

    const debi = bi.debi as Record<string, unknown> | undefined;
    const dt = bi.dt as Record<string, unknown> | undefined;
    const surfaceM2 = toNumber(debi?.sfc);
    const province = String(dt?.np ?? "").trim();
    const municipality = String(dt?.nm ?? "").trim();
    const use = debi?.luso ? String(debi.luso) : null;
    const address = bi.ldt ? String(bi.ldt) : `${province}`;

    if (surfaceM2 <= 0 || !province) return null;
    return { refCat, surfaceM2, province, municipality, use, address };
  } catch {
    return null;
  }
}
