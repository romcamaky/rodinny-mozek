// Czech labels for meal slot keys returned by the generate-meal-plan Edge Function.

export const MEAL_TYPE_LABELS: Record<string, string> = {
  dinner: 'Večeře',
  mom_breakfast: 'Snídaně (máma)',
  mom_lunch: 'Oběd (máma)',
  mom_snack: 'Svačina (máma)',
  kids_snack: 'Svačina (děti)',
  kids_breakfast: 'Snídaně (děti)',
  kids_snack_am: 'Dopolední svačina (děti)',
  kids_lunch: 'Oběd (děti)',
  kids_snack_pm: 'Odpolední svačina (děti)',
  breakfast: 'Snídaně',
  lunch: 'Oběd',
  baking: 'Pečení',
}

/** Emoji prefixes for Rohlik.cz-style shopping categories (visual scanning on mobile). */
export const SHOPPING_CATEGORY_EMOJI: Record<string, string> = {
  'Ovoce a zelenina': '🥕',
  'Mléčné výrobky': '🥛',
  'Maso a ryby': '🥩',
  Pečivo: '🍞',
  'Trvanlivé potraviny': '🥫',
  Mražené: '🧊',
  Nápoje: '🥤',
  Ostatní: '📦',
}
