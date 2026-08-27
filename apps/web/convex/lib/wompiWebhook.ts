// Wompi event signature validation.
// checksum = SHA256( concat(values at signature.properties paths within `data`)
//                    + signature.timestamp + events secret )
// https://docs.wompi.co/en/docs/colombia/eventos/

export interface WompiEvent {
  event: string;
  data: Record<string, unknown>;
  sent_at?: string;
  signature: { checksum: string; properties: string[]; timestamp: number };
}

function valueAtPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined,
      obj,
    );
}

export async function verifyWompiSignature(
  event: WompiEvent,
  secret: string,
): Promise<boolean> {
  if (!event?.signature?.checksum || !Array.isArray(event.signature.properties)) {
    return false;
  }
  let concatenated = "";
  for (const path of event.signature.properties) {
    concatenated += String(valueAtPath(event.data, path) ?? "");
  }
  concatenated += String(event.signature.timestamp) + secret;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(concatenated),
  );
  const expected = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  )
    .join("")
    .toUpperCase();
  return expected === event.signature.checksum.toUpperCase();
}
