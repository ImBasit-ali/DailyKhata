/**
 * Generate Company / Firm Code based on company name.
 * Rule: Skip the first similar prefix word if given (e.g. "Gill")
 * and take the first letter of the second and third words.
 * Example: "Gill Bricks Company" -> "BC"
 */
export function getCompanyCode(companyName) {
  if (!companyName || typeof companyName !== 'string') return '';

  const words = companyName
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean);

  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  // If 3 or more words (e.g. "Gill Bricks Company"):
  // Skip first word, take first letter of second and third word -> "BC"
  if (words.length >= 3) {
    const secondLetter = words[1][0] || '';
    const thirdLetter = words[2][0] || '';
    return (secondLetter + thirdLetter).toUpperCase();
  }

  // If 2 words:
  // Check if first word is a common brand/family prefix
  const commonPrefixes = [
    'gill',
    'al',
    'the',
    'ch',
    'mian',
    'malik',
    'khan',
    'shaikh',
    'new',
    'star',
  ];
  if (commonPrefixes.includes(words[0].toLowerCase())) {
    return (words[1].slice(0, 2) || words[0].slice(0, 2)).toUpperCase();
  }

  // Standard 2-word company: first letter of each word
  return ((words[0][0] || '') + (words[1][0] || '')).toUpperCase();
}

/**
 * Get map of company ID to Firm Code
 */
export function getCompanyCodeMap(companies = []) {
  const map = {};
  if (!Array.isArray(companies)) return map;
  companies.forEach((comp) => {
    if (comp?.id) {
      map[comp.id] = getCompanyCode(comp.name);
    }
  });
  return map;
}
