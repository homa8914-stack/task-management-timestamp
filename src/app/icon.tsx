import { ImageResponse } from "next/og";
import { iconDataUri } from "@/lib/icon-svg";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconDataUri()} width={size.width} height={size.height} alt="" />
      </div>
    ),
    { ...size }
  );
}
