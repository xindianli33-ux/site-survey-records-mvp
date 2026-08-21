import { NextResponse } from "next/server";
import { readSession, refreshGoogleSession, requiredEnv, sealSession, SESSION_COOKIE, sessionCookieOptions } from "@/app/lib/google-auth";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const current = await readSession();
    if (!current) return NextResponse.json({ error: "請先使用 Google 登入" }, { status: 401 });
    const { session, refreshed } = await refreshGoogleSession(current);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "未選取照片" }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "只能上傳照片" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "照片不可超過 20 MB" }, { status: 400 });

    const description = String(form.get("description") || file.name.replace(/\.[^.]+$/, ""));
    const latitude = String(form.get("latitude") || "");
    const longitude = String(form.get("longitude") || "");
    const boundary = `survey_${crypto.randomUUID()}`;
    const metadata = { name: file.name, description, parents: [requiredEnv("GOOGLE_DRIVE_ROOT_FOLDER_ID")] };
    const uploadBody = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`, file, `\r\n--${boundary}--`,
    ]);
    const driveResponse = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
      method: "POST",
      headers: { authorization: `Bearer ${session.accessToken}`, "content-type": `multipart/related; boundary=${boundary}` },
      body: uploadBody,
    });
    if (!driveResponse.ok) {
      console.error("Drive upload failed", driveResponse.status, (await driveResponse.text()).slice(0, 500));
      return NextResponse.json({ error: "Drive 上傳失敗，請確認資料夾授權範圍" }, { status: 502 });
    }
    const driveFile = (await driveResponse.json()) as { id: string; name: string; webViewLink?: string };
    const spreadsheetId = requiredEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
    const sheetResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/A:I:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ values: [[new Date().toISOString(), driveFile.id, driveFile.name, description, latitude, longitude, latitude && longitude ? "DEVICE_OR_MANUAL" : "NONE", session.user.email, driveFile.webViewLink || `https://drive.google.com/file/d/${driveFile.id}/view`]] }),
    });
    if (!sheetResponse.ok) {
      console.error("Sheets append failed", sheetResponse.status, (await sheetResponse.text()).slice(0, 500));
      return NextResponse.json({ error: "照片已上傳，但 Google Sheet 寫入失敗" }, { status: 502 });
    }
    const response = NextResponse.json({ ok: true, file: { id: driveFile.id, name: driveFile.name, url: driveFile.webViewLink || `https://drive.google.com/file/d/${driveFile.id}/view`, description, latitude: latitude ? Number(latitude) : undefined, longitude: longitude ? Number(longitude) : undefined } });
    if (refreshed) response.cookies.set(SESSION_COOKIE, await sealSession(session), sessionCookieOptions(new URL(request.url).protocol === "https:"));
    return response;
  } catch (error) {
    console.error("Google upload error", error);
    return NextResponse.json({ error: "同步時發生錯誤，請重新登入後再試" }, { status: 500 });
  }
}
