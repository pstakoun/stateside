import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "Stateside - Find your fastest path to a US green card with live USCIS data";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #f0fdf4 0%, #ffffff 50%, #f0fdf4 100%)",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Background decoration */}
        <div
          style={{
            position: "absolute",
            top: "-100px",
            right: "-100px",
            width: "400px",
            height: "400px",
            borderRadius: "50%",
            background: "rgba(34, 197, 94, 0.1)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-150px",
            left: "-150px",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background: "rgba(34, 197, 94, 0.05)",
          }}
        />

        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "32px",
          }}
        >
          <div
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "20px",
              background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 32px rgba(34, 197, 94, 0.3)",
            }}
          >
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M5 12h14M12 5l7 7-7 7"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span
            style={{
              fontSize: "64px",
              fontWeight: "700",
              color: "#111827",
              letterSpacing: "-2px",
            }}
          >
            Stateside
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: "32px",
            color: "#374151",
            marginBottom: "48px",
            fontWeight: "500",
          }}
        >
          Find your fastest path to a US green card
        </div>

        {/* Feature chips */}
        <div
          style={{
            display: "flex",
            gap: "16px",
            flexWrap: "wrap",
            justifyContent: "center",
            maxWidth: "900px",
          }}
        >
          {[
            "Live USCIS Data",
            "Visa Bulletin Tracking",
            "H-1B • TN • EB-1 • EB-2 • EB-3",
          ].map((feature) => (
            <div
              key={feature}
              style={{
                padding: "12px 24px",
                borderRadius: "999px",
                background: "white",
                color: "#166534",
                fontSize: "20px",
                fontWeight: "600",
                border: "2px solid #bbf7d0",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
              }}
            >
              {feature}
            </div>
          ))}
        </div>

        {/* Domain */}
        <div
          style={{
            position: "absolute",
            bottom: "32px",
            fontSize: "20px",
            color: "#22c55e",
            fontWeight: "600",
          }}
        >
          stateside.app
        </div>
      </div>
    ),
    { ...size }
  );
}
