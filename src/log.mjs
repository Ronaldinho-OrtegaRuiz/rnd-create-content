import fs from "node:fs";
import util from "node:util";

/** Salida síncrona para que PowerShell / npm muestren la línea al instante (evita buffer colgado). */
export function log(...args) {
  const line = util.format(...args) + "\n";
  const fd = process.stdout.fd;
  try {
    if (typeof fd === "number" && fd >= 0) {
      fs.writeSync(fd, line, "utf8");
    } else {
      console.log(...args);
    }
  } catch {
    console.log(...args);
  }
}

export function logErr(...args) {
  const line = util.format(...args) + "\n";
  const fd = process.stderr.fd;
  try {
    if (typeof fd === "number" && fd >= 0) {
      fs.writeSync(fd, line, "utf8");
    } else {
      console.error(...args);
    }
  } catch {
    console.error(...args);
  }
}
