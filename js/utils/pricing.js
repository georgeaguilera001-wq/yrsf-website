/**
 * Centralized Pricing Engine for YRSF
 * 
 * ALL actual pricing math MUST be performed by this deterministic application code.
 * AI must NEVER generate final calculated retail prices.
 */

export const DEFAULT_MARKUP_RATE = 0.30;
export const DEFAULT_CAPTAIN_HOURLY_RATE = 75;

/**
 * Rounds a dollar amount to the nearest cent securely.
 * @param {number} amount - Dollar amount (e.g. 1234.567)
 * @returns {number} Amount rounded to 2 decimal places (e.g. 1234.57)
 */
export function roundToCent(amount) {
  return Math.round(amount * 100) / 100;
}

/**
 * Deterministically calculates charter pricing using integer (cent) math.
 * 
 * @param {Object} params
 * @param {number} params.wholesalePrice - The owner's wholesale price in dollars.
 * @param {number} params.durationHours - The duration of the charter in hours.
 * @param {number} [params.markupRate] - The markup rate (default: 0.30 for 30%).
 * @param {number} [params.captainHourlyRate] - The captain fee per hour (default: 75).
 * @returns {Object} Deterministic pricing calculation with fields in dollars.
 */
export function calculateCharterPricing({
  wholesalePrice,
  durationHours,
  markupRate = DEFAULT_MARKUP_RATE,
  captainHourlyRate = DEFAULT_CAPTAIN_HOURLY_RATE
}) {
  // Validate inputs
  if (typeof wholesalePrice !== 'number' || isNaN(wholesalePrice) || wholesalePrice <= 0) {
    throw new Error('Invalid wholesale price');
  }
  if (typeof durationHours !== 'number' || isNaN(durationHours) || durationHours <= 0) {
    throw new Error('Invalid duration hours');
  }
  if (typeof markupRate !== 'number' || isNaN(markupRate)) {
    throw new Error('Invalid markup rate');
  }
  if (typeof captainHourlyRate !== 'number' || isNaN(captainHourlyRate) || captainHourlyRate < 0) {
    throw new Error('Invalid captain hourly rate');
  }

  // 1. Convert everything to cents for reliable integer math
  const wholesaleCents = Math.round(wholesalePrice * 100);
  
  // 2. Retail Pre-Tax: Wholesale * (1 + markupRate)
  // Use Math.round to round to the nearest cent according to our centralized rule.
  const retailPreTaxCents = Math.round(wholesaleCents * (1 + markupRate));
  
  // 3. Captain Fee: Hours * Captain Rate
  const captainFeeCents = Math.round(durationHours * captainHourlyRate * 100);
  
  // 4. Boat Price: Retail Pre-Tax - Captain Fee
  const boatPriceCents = retailPreTaxCents - captainFeeCents;
  
  // MANDATORY INVARIANT: Boat Price + Captain Fee MUST EXACTLY EQUAL Wholesale Price * 1.30
  if (boatPriceCents + captainFeeCents !== retailPreTaxCents) {
     throw new Error(`Invariant failed: Boat Price (${boatPriceCents}) + Captain Fee (${captainFeeCents}) != Retail Pre-Tax (${retailPreTaxCents})`);
  }
  
  // Convert back to floating point dollars safely
  return {
    wholesalePrice: wholesaleCents / 100,
    durationHours,
    markupRate,
    captainHourlyRate,
    retailPreTax: retailPreTaxCents / 100,
    captainFee: captainFeeCents / 100,
    boatPrice: boatPriceCents / 100
  };
}
