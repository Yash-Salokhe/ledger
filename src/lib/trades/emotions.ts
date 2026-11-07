/** Emotion tags offered on Trade review. Kept short so they fit one row of chips. */
export const EMOTIONS = ["Calm", "Confident", "Patient", "FOMO", "Revenge", "Hesitant", "Greedy", "Bored", "Tired"] as const;
export type Emotion = (typeof EMOTIONS)[number];
