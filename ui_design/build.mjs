import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const views = ["overview", "library", "upload", "sales", "buy", "link", "stats", "admin", "login", "mcp", "agent", "design"];
const read = (p) => fs.readFileSync(path.join(here, p), "utf8").trim();

const body = views.map((v) => read(`src/views/${v}.html`)).join("\n\n");
const parts = ["drawer", "dock"].map((p) => read(`src/parts/${p}.html`)).join("\n\n");

const shell = read("src/shell.html");
const out = shell.replace("<!-- @views -->", body).replace("<!-- @parts -->", parts);
fs.writeFileSync(path.join(here, "index.html"), out, "utf8");
console.log(`index.html built · ${(out.length / 1024).toFixed(1)} KB · ${views.length} views`);
