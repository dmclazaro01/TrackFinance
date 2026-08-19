// Approximate average price of second-hand housing (€/m²) by province.
// SEED VALUES — rough 2024 ballparks, meant to be replaced with the official
// dataset (Ministerio de Vivienda "precio de la vivienda libre" or Idealista).
// Used only for an *estimate*: value ≈ surface(m²) × €/m². Edit freely.

const NATIONAL_FALLBACK = 1750;

// Keys are normalized province names (see `norm`).
const PRICE_BY_PROVINCE: Record<string, number> = {
  MADRID: 3200,
  BARCELONA: 2450,
  GIPUZKOA: 3050,
  BIZKAIA: 2500,
  ARABAALAVA: 2300,
  ILLESBALEARS: 3550,
  MALAGA: 2650,
  ALICANTE: 1750,
  VALENCIA: 1650,
  SEVILLA: 1650,
  ACORUNA: 1550,
  LASPALMAS: 1950,
  STACRUZDETENERIFE: 1900,
  NAVARRA: 1500,
  CANTABRIA: 1650,
  ZARAGOZA: 1650,
  GIRONA: 2050,
  TARRAGONA: 1450,
  CADIZ: 1650,
  GRANADA: 1550,
  MURCIA: 1250,
  ALMERIA: 1350,
  CORDOBA: 1350,
  HUELVA: 1250,
  JAEN: 950,
  BADAJOZ: 1050,
  CACERES: 1050,
  TOLEDO: 1050,
  CIUDADREAL: 950,
  CUENCA: 900,
  GUADALAJARA: 1350,
  ALBACETE: 1100,
  LEON: 1100,
  VALLADOLID: 1500,
  SALAMANCA: 1450,
  BURGOS: 1400,
  PALENCIA: 1200,
  ZAMORA: 1000,
  AVILA: 1100,
  SEGOVIA: 1350,
  SORIA: 1200,
  ASTURIAS: 1450,
  LUGO: 1200,
  OURENSE: 1200,
  PONTEVEDRA: 1550,
  LARIOJA: 1450,
  HUESCA: 1300,
  TERUEL: 1000,
  CASTELLON: 1250,
  LLEIDA: 1200,
  CEUTA: 2050,
  MELILLA: 1950,
};

/** Normalize a province name for lookup: upper-case, strip accents/spaces/punct. */
function norm(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toUpperCase()
    .replace(/[^A-Z]/g, ""); // drop spaces, slashes, dots
}

// Regional/alternate spellings → canonical keys above.
const ALIASES: Record<string, string> = {
  ALAVA: "ARABAALAVA",
  ARABA: "ARABAALAVA",
  BALEARS: "ILLESBALEARS",
  ISLASBALEARES: "ILLESBALEARS",
  BALEARES: "ILLESBALEARS",
  CORUNA: "ACORUNA",
  LACORUNA: "ACORUNA",
  GUIPUZCOA: "GIPUZKOA",
  VIZCAYA: "BIZKAIA",
  TENERIFE: "STACRUZDETENERIFE",
  SANTACRUZDETENERIFE: "STACRUZDETENERIFE",
  ALACANT: "ALICANTE",
  GERONA: "GIRONA",
  LERIDA: "LLEIDA",
  ORENSE: "OURENSE",
  NAFARROA: "NAVARRA",
};

/** €/m² for a province name (as returned by Catastro). Falls back to national. */
export function pricePerM2(province: string | null | undefined): number {
  if (!province) return NATIONAL_FALLBACK;
  const key = norm(province);
  const resolved = ALIASES[key] ?? key;
  return PRICE_BY_PROVINCE[resolved] ?? NATIONAL_FALLBACK;
}

export const NATIONAL_PRICE_PER_M2 = NATIONAL_FALLBACK;
