import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types";

export async function POST(request: NextRequest) {
  // Host preserves the browser-facing address when Next.js normalizes loopback URLs.
  const host = request.headers.get("host");
  const origin = `${request.nextUrl.protocol}//${host}`;
  if (!host || request.headers.get("origin") !== origin) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return NextResponse.json({ error: "Invitations are disabled in the public demo." }, { status: 403 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Invitations are not configured. Add the server-only service role key." }, { status: 503 });
  }
  try {
    const client = await serverClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const { data: profile, error: profileError } = await client.from("profiles").select("*").eq("id", user.id).single();
    if (profileError || !profile?.is_active || profile.role !== "admin") {
      return NextResponse.json({ error: "Active admin access is required." }, { status: 403 });
    }
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return NextResponse.json({ error: "Provide a valid JSON request." }, { status: 400 });
    }
    if (typeof input !== "object" || input === null || !("email" in input) || !("full_name" in input)
      || typeof input.email !== "string" || typeof input.full_name !== "string"
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.length > 254
      || input.full_name.trim().length < 1 || input.full_name.trim().length > 100) {
      return NextResponse.json({ error: "Provide a valid email and a name of 1–100 characters." }, { status: 400 });
    }
    const service = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data, error } = await service.auth.admin.inviteUserByEmail(input.email.trim(), {
      data: { full_name: input.full_name.trim() },
      redirectTo: `${origin}/auth/confirm`
    });
    if (error) {
      console.error("Invitation provider rejected request:", error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const { error: auditError } = await service.from("audit_logs").insert({
      action_by: user.id, action_type: "MEMBER_INVITED",
      details: JSON.stringify({ member_id: data.user.id, full_name: input.full_name.trim() })
    });
    if (auditError) {
      console.error("Invitation was sent but audit insert failed:", auditError);
      return NextResponse.json({ error: "Invitation sent, but its audit entry could not be saved. Do not resend; contact the administrator." }, { status: 500 });
    }
    return NextResponse.json({ message: "Invitation sent. The member will receive an email to set their password." });
  } catch (error) {
    console.error("Invitation request failed:", error);
    return NextResponse.json({ error: "The invitation service is unavailable. Check the server configuration and try again." }, { status: 500 });
  }
}
