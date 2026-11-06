import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Entrada única para `node server.js` e `pm2 start server.js`.
// Resolve o .env a partir do projeto, mesmo se iniciado de outra pasta.
process.chdir(fileURLToPath(new URL(".", import.meta.url)));
if (!existsSync(new URL("./client/dist/index.html", import.meta.url))) {
  console.error("Frontend não compilado. Execute npm run build antes de iniciar.");
  process.exit(1);
}
await import("./server/index.js");
