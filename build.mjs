// Turns src/index.html into one data URI. Run: node build.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { minify } from "terser";

const LIMIT = 3072;
const src = readFileSync("src/index.html", "utf8");

// Squeeze whitespace in shaders written as glsl`...` (terser leaves strings alone).
function glsl(code) {
  return code
    .replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([-+*\/=<>(){}\[\];,!&|?:])\s*/g, "$1")
    .trim();
}

let html = "";
const re = /(<script[^>]*>[\s\S]*?<\/script>|<style[^>]*>[\s\S]*?<\/style>)/;
for (const part of src.split(re)) {
  const m = part.match(/^<script([^>]*)>([\s\S]*?)<\/script>$/);
  if (m) {
    const [, attrs, body] = m;
    let out;
    if (/importmap/.test(attrs)) {
      out = JSON.stringify(JSON.parse(body));          // minify JSON
    } else {
      const js = body.replace(/glsl`([^`]*)`/g, (_, s) => JSON.stringify(glsl(s)));
      out = (await minify(js, {
        module: /module/.test(attrs),
        toplevel: true,
        compress: { passes: 3 },
      })).code;
    }
    html += `<script${attrs}>${out}</script>`;
  } else if (part.startsWith("<style")) {
    html += part
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\s+/g, " ")
      .replace(/\s*([{};:,>])\s*/g, "$1")
      .replace(/;}/g, "}");
  } else {
    html += part.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").replace(/>\s+</g, "><").trim();
  }
}

// Only these three break a data URI. Encoding anything else costs bytes for nothing.
const uri = "data:text/html," + html.replace(/%/g, "%25").replace(/#/g, "%23").replace(/\n/g, "%0A");

mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", html);
writeFileSync("dist/uri.txt", uri);

const bytes = Buffer.byteLength(uri);
console.log(bytes + " / " + LIMIT + " bytes, " + (bytes > LIMIT ? bytes - LIMIT + " over" : LIMIT - bytes + " left"));
