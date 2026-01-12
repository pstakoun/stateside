import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeReceipt(receipt: string): string {
  return receipt.trim().toUpperCase().replace(/\s+/g, "");
}

// USCIS receipt numbers are typically 13 chars: 3 letters + 10 digits
function isValidReceipt(receipt: string): boolean {
  return /^[A-Z]{3}\d{10}$/.test(receipt);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const receiptRaw = searchParams.get("receipt") || "";
  const receipt = normalizeReceipt(receiptRaw);

  if (!isValidReceipt(receipt)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid receipt number format. Expected e.g. IOE1234567890.",
      },
      { status: 400 }
    );
  }

  const sourceUrl = `https://egov.uscis.gov/casestatus/mycasestatus.do?appReceiptNum=${encodeURIComponent(receipt)}`;

  try {
    const res = await fetch(sourceUrl, {
      // Keep headers minimal to reduce bot-block risk; still identify ourselves.
      headers: {
        "User-Agent": "Stateside/1.0",
        "Accept": "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `USCIS request failed (${res.status})` },
        { status: 502 }
      );
    }

    const html = await res.text();

    // Heuristic parsing:
    // - There is usually an H1 for the actual status ("Case Was Received", etc.)
    // - There is usually a paragraph with details underneath.
    const h1s = Array.from(html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)).map((m) => stripTags(m[1]));
    const statusTitle =
      h1s.find((t) => t && t.toLowerCase() !== "case status online") || "Case status";

    // Try to capture the first meaningful paragraph after the main status container.
    // Commonly present as <p> ... </p> near the status section.
    const ps = Array.from(html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)).map((m) => stripTags(m[1]));
    const statusDetails =
      ps.find((p) => p && p.length > 30 && !p.toLowerCase().includes("enter your receipt number")) ||
      "";

    return NextResponse.json({
      success: true,
      receipt,
      statusTitle,
      statusDetails,
      fetchedAt: new Date().toISOString(),
      sourceUrl,
      caveats: [
        "USCIS does not provide an official public JSON API; this reads the public Case Status page.",
        "If USCIS changes the page format or blocks automated requests, this may stop working.",
      ],
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch USCIS case status." },
      { status: 500 }
    );
  }
}

