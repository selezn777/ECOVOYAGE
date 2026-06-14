import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const env = Object.fromEntries(
  readFileSync(resolve(import.meta.dirname, "../.env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const eq = l.indexOf("="); return [l.slice(0, eq).trim(), l.slice(eq + 1).trim().replace(/^"|"$/g, "")]; })
);

const supabase = createClient(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"], { auth: { persistSession: false } });

// Бин → booking_dispatcher (подчинённый диспетчер)
const { error } = await supabase.from("users").update({ role: "booking_dispatcher", full_name: "Бин" }).eq("login", "bin");
if (error) console.error("❌ Бин:", error.message);
else console.log("✅ Бин → booking_dispatcher");

// Убедиться что Вонг — dispatcher
const { error: e2 } = await supabase.from("users").update({ full_name: "Le Viet Vong" }).eq("login", "le.vong");
if (e2) console.error("❌ Вонг:", e2.message);
else console.log("✅ Le Viet Vong → dispatcher (без изменений)");
