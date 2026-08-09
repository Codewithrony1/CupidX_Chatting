// Utility to convert ISO 3166-1 alpha-2 country code (e.g., 'IN', 'US') to flag emoji (🇮🇳, 🇺🇸)
export function getCountryFlag(countryCode?: string): string {
  if (!countryCode || countryCode.length !== 2) {
    return '🇮🇳'; // Default fallback flag for India
  }

  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));

  return String.fromCodePoint(...codePoints);
}

export function getCountryName(countryCode?: string): string {
  if (!countryCode) return 'India';
  const code = countryCode.toUpperCase();
  const names: Record<string, string> = {
    IN: 'India',
    US: 'United States',
    GB: 'United Kingdom',
    CA: 'Canada',
    AU: 'Australia',
    AE: 'United Arab Emirates',
    DE: 'Germany',
    FR: 'France',
    JP: 'Japan',
    BR: 'Brazil',
    RU: 'Russia',
    CN: 'China',
    PK: 'Pakistan',
    BD: 'Bangladesh',
    NP: 'Nepal',
    LK: 'Sri Lanka',
    SG: 'Singapore',
    ID: 'Indonesia',
    MY: 'Malaysia',
    PH: 'Philippines',
    KR: 'South Korea',
    SA: 'Saudi Arabia',
    ZA: 'South Africa',
  };
  return names[code] || countryCode.toUpperCase();
}

// Auto-detect user country code via IP API
export async function detectUserCountry(): Promise<{ countryCode: string; countryName: string; flag: string }> {
  try {
    const res = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.country_code) {
        const code = data.country_code.toUpperCase();
        return {
          countryCode: code,
          countryName: data.country_name || getCountryName(code),
          flag: getCountryFlag(code),
        };
      }
    }
  } catch (err) {
    console.warn('GeoIP detection error, using fallback:', err);
  }

  return {
    countryCode: 'IN',
    countryName: 'India',
    flag: '🇮🇳',
  };
}
