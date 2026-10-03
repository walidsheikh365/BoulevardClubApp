import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (!token || (type !== "invite" && type !== "recovery")) {
    return NextResponse.redirect(new URL("/?auth_error=invalid_link", request.url));
  }
  try {
    const client = await serverClient();
    const { error } = await client.auth.verifyOtp({ token_hash: token, type });
    if (error) return NextResponse.redirect(new URL("/?auth_error=expired_link", request.url));
    return NextResponse.redirect(new URL("/?setup=1", request.url));
  } catch (error) {
    console.error("Invitation confirmation failed:", error);
    return NextResponse.redirect(new URL("/?auth_error=configuration", request.url));
  }
}
