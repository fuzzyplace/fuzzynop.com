export type Lead = { source: string; name: string; email: string; org: string; need: string; scale: string; notes: string; receivedAt: string };
export function parseLead(data: unknown, now?: Date): { lead?: Lead; error?: string; trap?: boolean };
export function leadEmail(lead: Lead): { subject: string; text: string };
export function POST(request: Request): Promise<Response>;
export function GET(): Response;
