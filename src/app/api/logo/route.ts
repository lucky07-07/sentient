import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get("domain");
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return new NextResponse(null, { status: 400 });
  }
  try {
    const r = await fetch(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return new NextResponse(null, { status: 404 });
    const buf = await r.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": r.headers.get("Content-Type") || "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
