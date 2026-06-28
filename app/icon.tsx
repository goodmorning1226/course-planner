import { ImageResponse } from "next/og";

// Generates a PNG favicon (browsers' tab/address-bar + Google search results
// recognise raster icons most reliably). Keeps the dark calendar mark.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#18181b",
          borderRadius: 14,
        }}
      >
        <svg
          width="42"
          height="42"
          viewBox="0 0 32 32"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="7" y="9" width="18" height="16" rx="2" />
          <path d="M12 7v4M20 7v4M7 14h18" />
          <path d="M13 14v11M19 14v11M7 19.5h18" />
        </svg>
      </div>
    ),
    size
  );
}
