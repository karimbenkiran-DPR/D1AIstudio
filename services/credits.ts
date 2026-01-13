
export const COST_KEY = 'dpr_total_cost_usd';
export const EVENT_CREDITS_UPDATED = 'dpr_cost_updated'; // Keeping event name similar for compatibility, but logic changes

// Pricing Constants (Estimated API costs)
export const PRICE_PER_IMAGE_PRO = 0.04; // Gemini 3 Pro (Standard/1K/2K)
export const PRICE_PER_IMAGE_4K = 0.134; // Gemini 3 Pro (4K)
export const PRICE_PER_IMAGE_FLASH = 0.005; // Gemini Flash (Edit)

export const getConsumedCredits = (): number => {
  const stored = localStorage.getItem(COST_KEY);
  return stored ? parseFloat(stored) : 0;
};

export const addConsumedCredits = (amount: number): number => {
  const current = getConsumedCredits();
  const next = current + amount;
  localStorage.setItem(COST_KEY, next.toFixed(4));
  
  // Dispatch event so components can update reactively
  window.dispatchEvent(new Event(EVENT_CREDITS_UPDATED));
  return next;
};

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  }).format(amount);
};
