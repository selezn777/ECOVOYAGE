import os from "node:os";

const port = process.env.PORT || "3000";
const ips = [];
try {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const addr of nets[name] ?? []) {
      if (addr.family === "IPv4" && !addr.internal) ips.push(addr.address);
    }
  }
} catch {
  /* sandbox / restricted env */
}
console.log("");
console.log("  На телефоне (та же Wi‑Fi) откройте в браузере:");
if (ips.length === 0) {
  console.log("    http://<IP-вашего-Mac>:" + port);
  console.log("    (IP: macOS - «Системные настройки» → Сеть, или: ipconfig getifaddr en0)");
} else {
  for (const ip of ips) {
    console.log("    http://" + ip + ":" + port);
  }
}
console.log("");
