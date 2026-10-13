export const profilePrompts = [
  { key: "IDEAL_FIRST_RALLY", label: "My ideal first Rally is..." },
  { key: "AFTER_CLASS_FIND_ME", label: "After class, you can find me..." },
  { key: "COMPETITIVE_SIDE", label: "My competitive side comes out when..." },
  { key: "PERFECT_WEEKEND", label: "A perfect weekend includes..." },
  { key: "RECENT_OBSESSION", label: "My recent obsession is..." },
  { key: "BEST_CAMPUS_SPOT", label: "The best campus spot is..." }
] as const;

export const profilePromptKeys = profilePrompts.map(({ key }) => key) as [
  (typeof profilePrompts)[number]["key"],
  ...(typeof profilePrompts)[number]["key"][]
];
