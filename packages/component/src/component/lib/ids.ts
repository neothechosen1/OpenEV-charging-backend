export function randomToken(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** OCPP idTag must be <= 20 chars. "EV" + 16 hex = 18. */
export function randomIdTag(): string {
  return "EV" + randomToken(8);
}
