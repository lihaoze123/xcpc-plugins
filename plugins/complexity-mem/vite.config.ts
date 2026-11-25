import { defineConfig } from "vite";
import { xcpcPlugin } from "@xcpc/plugin-sdk/vite";

export default defineConfig({
  plugins: [xcpcPlugin()],
});
