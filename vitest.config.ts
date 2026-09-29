import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Fuseau volontairement différent de Bruxelles : les tests prouvent que le code ne dépend pas du fuseau de la machine.
    env: { TZ: "America/New_York" },
  },
});
