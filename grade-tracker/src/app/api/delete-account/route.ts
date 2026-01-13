import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: Request) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
  }

  const token = authHeader.slice("Bearer ".length);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json(
      { error: userError?.message ?? "Invalid session." },
      { status: 401 },
    );
  }

  const userId = userData.user.id;
  const deleteTables = [
    "assignments",
    "categories",
    "courses",
    "terms",
    "profiles",
  ];

  for (const table of deleteTables) {
    const { error } = await supabase.from(table).delete().eq("user_id", userId);
    if (error) {
      return NextResponse.json(
        { error: `Failed to delete ${table}: ${error.message}` },
        { status: 500 },
      );
    }
  }

  const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
