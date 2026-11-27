import { defineConfig } from "vite";
import { xcpcPlugin } from "@xcpc-workstation/plugin-sdk/vite";

export default defineConfig({
  plugins: [xcpcPlugin()],
});
