import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const ogImageSize = { width: 1200, height: 630 };

// Shared by opengraph-image.tsx and twitter-image.tsx so both cards use the identical generated
// image rather than two drifting copies. Reuses the login screen's hero photo and the real
// wordmark — before this there was no app-controlled share image at all, so link previews fell
// back to whatever the widest <img> on the page happened to be (the 2600x623 wordmark), cropped
// badly by the consuming platform's own guesswork.
export async function generateShareImage() {
  const [heroData, logoData] = await Promise.all([
    readFile(join(process.cwd(), "public/auth-hero-female-v2.png"), "base64"),
    readFile(join(process.cwd(), "public/jesdanpay-logo.png"), "base64"),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          // Real primary-600/800 greens from globals.css, not placeholder hex.
          background: "linear-gradient(135deg, #166640 0%, #0e3f2a 100%)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 24, width: "58%", padding: "0 56px" }}>
          <img
            src={`data:image/png;base64,${logoData}`}
            alt=""
            width={340}
            height={81}
            style={{ filter: "brightness(0) invert(1)" }}
          />
          <div style={{ fontSize: 40, fontWeight: 700, color: "white", lineHeight: 1.25 }}>
            Facilitating suppliers payment to China.
          </div>
        </div>
        <div style={{ display: "flex", width: "42%", height: "100%", alignItems: "flex-end", overflow: "hidden" }}>
          <img
            src={`data:image/png;base64,${heroData}`}
            alt=""
            width={504}
            height={630}
            style={{ objectFit: "cover" }}
          />
        </div>
      </div>
    ),
    { ...ogImageSize },
  );
}
