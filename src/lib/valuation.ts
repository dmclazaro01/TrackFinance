import "server-only";
import { getCatastroData } from "@/lib/catastro";
import { pricePerM2 } from "@/data/pricePerM2";

export type Appraisal = {
  surfaceM2: number;
  province: string;
  municipality: string;
  address: string;
  pricePerM2: number;
  value: number; // surface × €/m²
};

/**
 * Estimate a property's market value from its cadastral reference:
 * surface (m²) from Catastro × average €/m² for the province.
 * Returns null when the reference can't be resolved.
 */
export async function computeAppraisal(refCat: string): Promise<Appraisal | null> {
  const data = await getCatastroData(refCat);
  if (!data) return null;
  const ppm2 = pricePerM2(data.province);
  return {
    surfaceM2: data.surfaceM2,
    province: data.province,
    municipality: data.municipality,
    address: data.address,
    pricePerM2: ppm2,
    value: Math.round(data.surfaceM2 * ppm2),
  };
}
