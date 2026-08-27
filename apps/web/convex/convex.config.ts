import { defineApp } from "convex/server";
import evCharging from "@openev/charging/convex.config";
import staticHosting from "@convex-dev/static-hosting/convex.config";

const app = defineApp();
app.use(evCharging);
app.use(staticHosting);

export default app;
