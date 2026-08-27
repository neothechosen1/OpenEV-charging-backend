import { defineApp } from "convex/server";
import evCharging from "@openev/charging/convex.config";

const app = defineApp();
app.use(evCharging);

export default app;
