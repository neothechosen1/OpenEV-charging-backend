import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

// Dev scaffold UI — proves the full loop end to end.
// The real driver checkout + admin dashboard land in Phase 3.
export default function App() {
  const seedDemo = useMutation(api.charging.seedDemo);
  const demoCheckout = useMutation(api.charging.demoCheckout);
  const stopSession = useMutation(api.charging.stopSession);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const live = useQuery(
    api.charging.liveSession,
    sessionId ? { sessionId } : "skip",
  );

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", fontFamily: "monospace" }}>
      <h1>OpenEV — dev scaffold</h1>
      <ol>
        <li>
          <button
            onClick={async () => {
              const result = await seedDemo({});
              setQrToken(result.qrToken);
            }}
          >
            1. Seed demo data
          </button>{" "}
          {qrToken && <code>QR token: {qrToken}</code>}
        </li>
        <li>
          <button
            disabled={!qrToken}
            onClick={async () => {
              const info = await demoCheckout({ qrToken: qrToken! });
              setSessionId(info.sessionId);
            }}
          >
            2. Demo checkout (start charging)
          </button>
        </li>
        <li>
          <button
            disabled={!sessionId}
            onClick={() => stopSession({ sessionId: sessionId! })}
          >
            3. Stop charging
          </button>
        </li>
      </ol>
      {live && (
        <pre style={{ background: "#f4f4f4", padding: 16 }}>
          {JSON.stringify(
            {
              status: live.status,
              kWh: (live.energyWh / 1000).toFixed(3),
              powerW: live.lastPowerW,
              cost: `${live.costMinor} ${live.tariffSnapshot.currency}`,
              amounts: live.amounts,
            },
            null,
            2,
          )}
        </pre>
      )}
    </main>
  );
}
