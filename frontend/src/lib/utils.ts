// tailwind utility helpers
// provides class merge and conditional logic
// ensures consistent styling for dynamic themes
import { twMerge } from 'tailwind-merge';
import clsx, { type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
