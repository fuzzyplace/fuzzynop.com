// Saves one "Work with us" brief as a private JSON file in Vercel Blob.
// Same pattern as the Pink Team workshop site (fuzzyplace/pink-team, api/lead.js).
// Nothing is public: the store is private and this endpoint only writes.
//
// Needs a Blob store connected to the project (BLOB_READ_WRITE_TOKEN).
// Email: when RESEND_API_KEY and LEAD_EMAIL_TO are set, each saved brief is also emailed to
// LEAD_EMAIL_TO (the address lives in the env var, never in this public repo), with reply-to set to
// the sender so a reply goes straight back to them. LEAD_EMAIL_FROM overrides the from address.
// Optional: LEAD_NOTIFY_URL, a webhook that gets one short line per brief ({ text }, the shape Slack
// incoming webhooks take); that line carries no email address and no notes.
// A failed email or ping never loses a brief: it is saved first.
import { put } from "@vercel/blob";
import { Resend } from "resend";

const clean = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** Request body → a lead, or the reason it isn't one. Pure. */
export function parseLead(data, now = new Date()) {
  if (!data || typeof data !== "object") return { error: "bad_json" };
  // Honeypot: real visitors never fill this field.
  if (clean(data.website, 200)) return { trap: true };
  const lead = {
    source: "fuzzynop.com",
    name: clean(data.name, 120),
    email: clean(data.email, 200).toLowerCase(),
    org: clean(data.org, 160),
    need: clean(data.need, 80),
    scale: clean(data.scale, 60),
    notes: clean(data.notes, 2000),
    receivedAt: now.toISOString(),
  };
  if (!lead.name) return { error: "name_required" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email)) return { error: "email_invalid" };
  return { lead };
}

/** The brief as a plain-text email. Pure. */
export function leadEmail(lead) {
  const rows = [
    ["Name", lead.name],
    ["Email", lead.email],
    ["Organization", lead.org],
    ["What they need", lead.need],
    ["How big", lead.scale],
    ["Notes", lead.notes],
  ].filter(([, v]) => v);
  return {
    subject: `New brief: ${[lead.name, lead.org].filter(Boolean).join(", ")}`.replace(/[\r\n]+/g, " ").slice(0, 160),
    text: rows.map(([k, v]) => `${k}: ${v}`).join("\n") + `\n\nReceived ${lead.receivedAt} on fuzzynop.com. Reply to this email to answer them.`,
  };
}

async function email(lead) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.LEAD_EMAIL_TO;
  if (!key || !to) return;
  try {
    const { error } = await new Resend(key).emails.send({
      from: process.env.LEAD_EMAIL_FROM || "fuzzynop.com <onboarding@resend.dev>",
      to: [to],
      replyTo: lead.email,
      ...leadEmail(lead),
    });
    if (error) console.error("lead email failed", error.name, error.message);
  } catch (err) {
    console.error("lead email failed", err && err.message); // the brief is already saved
  }
}

async function notify(lead) {
  const url = process.env.LEAD_NOTIFY_URL;
  if (!url) return;
  const text = `New brief on fuzzynop.com: ${[lead.need, lead.scale, lead.org].filter(Boolean).join(" / ") || "no details"}`;
  try {
    await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(4000) });
  } catch (err) {
    console.error("lead notify failed", err && err.message); // the brief is already saved
  }
}

export async function POST(request) {
  let data;
  try {
    const raw = await request.text();
    if (raw.length > 8000) return json(413, { ok: false, error: "too_large" });
    data = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, error: "bad_json" });
  }
  const parsed = parseLead(data);
  if (parsed.trap) return json(200, { ok: true }); // pretend it worked
  if (parsed.error) return json(400, { ok: false, error: parsed.error });
  const { lead } = parsed;

  const id = lead.receivedAt.replace(/[:.]/g, "-") + "-" + Math.random().toString(36).slice(2, 8);
  try {
    await put(`leads/fuzzynop-com/${id}.json`, JSON.stringify(lead, null, 2), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
    });
  } catch (err) {
    console.error("lead save failed", err && err.message);
    return json(500, { ok: false, error: "save_failed" });
  }
  await Promise.all([email(lead), notify(lead)]);
  return json(200, { ok: true });
}

export function GET() {
  return json(405, { ok: false, error: "method_not_allowed" });
}
