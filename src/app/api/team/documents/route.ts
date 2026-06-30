export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";


async function authenticate(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing authentication" };

  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, team_id, player_id")
    .eq("id", userRes.user.id)
    .maybeSingle();

  if (!profile) return { error: "Profile not found" };

  return { uid: userRes.user.id, profile, supabase };
}

/**
 * GET /api/team/documents?teamId=...&category=...
 * List all documents for a team, optionally filtered by category.
 */
export async function GET(req: NextRequest) {
  const result = await authenticate(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 401 });
  const { profile, supabase } = result;

  const url = new URL(req.url);
  const teamId = url.searchParams.get("teamId");
  const category = url.searchParams.get("category");

  if (!teamId) {
    return NextResponse.json({ error: "Missing teamId" }, { status: 400 });
  }

  if (profile.team_id !== teamId) {
    return NextResponse.json({ error: "Not authorized for this team" }, { status: 403 });
  }

  let query = supabase
    .from("team_documents")
    .select("id, team_id, uploaded_by, title, category, file_name, file_path, file_size, mime_type, created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Build public URLs for each document
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const documents = (data ?? []).map((doc) => ({
    ...doc,
    url: `${supabaseUrl}/storage/v1/object/public/team-documents/${doc.file_path}`,
  }));

  return NextResponse.json({ documents });
}

/**
 * POST /api/team/documents
 * Upload a document (multipart form data).
 * Fields: teamId, title, category, file (PDF)
 */
export async function POST(req: NextRequest) {
  const result = await authenticate(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 401 });
  const { uid, profile, supabase } = result;

  // Only coaches/admins
  const role = (profile.role ?? "").toUpperCase();
  if (role !== "COACH" && role !== "ADMIN") {
    return NextResponse.json({ error: "Only coaches can upload documents" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const teamId = formData.get("teamId") as string;
    const title = formData.get("title") as string;
    const category = (formData.get("category") as string) || "general";
    const file = formData.get("file") as File | null;

    if (!teamId || !title?.trim() || !file) {
      return NextResponse.json(
        { error: "Missing required fields: teamId, title, file" },
        { status: 400 }
      );
    }

    if (profile.team_id !== teamId) {
      return NextResponse.json({ error: "Not authorized for this team" }, { status: 403 });
    }

    // Validate file type
    if (!file.type.includes("pdf")) {
      return NextResponse.json({ error: "Only PDF files are allowed" }, { status: 400 });
    }

    // Max 20MB
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 400 });
    }

    // Upload to Supabase Storage
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${teamId}/${category}/${timestamp}_${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from("team-documents")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json({ error: "Failed to upload file: " + uploadError.message }, { status: 500 });
    }

    // Insert document record
    const { data: doc, error: insertError } = await supabase
      .from("team_documents")
      .insert({
        team_id: teamId,
        uploaded_by: uid,
        title: title.trim(),
        category,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      // Try to clean up the uploaded file
      await supabase.storage.from("team-documents").remove([filePath]);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: doc.id });
  } catch (err) {
    console.error("Unexpected error in POST /api/team/documents:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/team/documents
 * Body: { id, teamId }
 */
export async function DELETE(req: NextRequest) {
  const result = await authenticate(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 401 });
  const { profile, supabase } = result;

  const role = (profile.role ?? "").toUpperCase();
  if (role !== "COACH" && role !== "ADMIN") {
    return NextResponse.json({ error: "Only coaches can delete documents" }, { status: 403 });
  }

  const body = await req.json();
  const { id, teamId } = body;

  if (!id || !teamId) {
    return NextResponse.json({ error: "Missing id or teamId" }, { status: 400 });
  }

  if (profile.team_id !== teamId) {
    return NextResponse.json({ error: "Not authorized for this team" }, { status: 403 });
  }

  // Get file path before deleting
  const { data: doc } = await supabase
    .from("team_documents")
    .select("file_path")
    .eq("id", id)
    .eq("team_id", teamId)
    .single();

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Delete from storage
  await supabase.storage.from("team-documents").remove([doc.file_path]);

  // Delete record
  const { error } = await supabase
    .from("team_documents")
    .delete()
    .eq("id", id)
    .eq("team_id", teamId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
