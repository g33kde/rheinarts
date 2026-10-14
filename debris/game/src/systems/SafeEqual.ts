/**
 * Compares two strings without bailing out at the first difference, so how
 * long a password check takes does not reveal how much of a guess was
 * right. (Passwords are short and the server is not a bank, but the habit
 * costs nothing.) Different lengths are still a mismatch.
 */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
