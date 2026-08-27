import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export async function enqueueCommand(
  ctx: MutationCtx,
  args: {
    chargerId: Id<"chargers">;
    ocppIdentity: string;
    action: string;
    payload: unknown;
    sessionId?: Id<"sessions">;
  },
): Promise<Id<"commands">> {
  return await ctx.db.insert("commands", {
    chargerId: args.chargerId,
    ocppIdentity: args.ocppIdentity,
    action: args.action,
    payload: args.payload,
    sessionId: args.sessionId,
    status: "pending",
  });
}

/**
 * Atomically read + mark-sent the pending commands for one charger.
 * The gateway calls this (via the host) piggybacked on every OCPP event
 * and on a short poll while the charger is connected.
 */
export const takePending = mutation({
  args: { ocppIdentity: v.string() },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("commands")
      .withIndex("by_ocppIdentity_and_status", (q) =>
        q.eq("ocppIdentity", args.ocppIdentity).eq("status", "pending"),
      )
      .take(10);
    for (const cmd of pending) {
      await ctx.db.patch(cmd._id, { status: "sent" });
    }
    return pending.map((cmd) => ({
      commandId: cmd._id,
      action: cmd.action,
      payload: cmd.payload,
    }));
  },
});

export const markResult = mutation({
  args: {
    commandId: v.id("commands"),
    ok: v.boolean(),
    resultPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const cmd = await ctx.db.get(args.commandId);
    if (!cmd) return null;
    await ctx.db.patch(args.commandId, {
      status: args.ok ? "accepted" : "rejected",
      resultPayload: args.resultPayload,
    });
    // A rejected RemoteStart means the session will never begin.
    if (!args.ok && cmd.action === "RemoteStartTransaction" && cmd.sessionId) {
      const session = await ctx.db.get(cmd.sessionId);
      if (session && session.status === "authorized") {
        await ctx.db.patch(cmd.sessionId, {
          status: "failed",
          stopReason: "RemoteStartRejected",
        });
        const connector = await ctx.db.get(session.connectorId);
        if (connector && connector.currentSessionId === cmd.sessionId) {
          await ctx.db.patch(connector._id, { currentSessionId: undefined });
        }
      }
    }
    return null;
  },
});
