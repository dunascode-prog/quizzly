import { cacheLife } from "next/cache";
import QRCode from "qrcode";

// Real QR code for the Play listing, rendered to inline SVG at build time.
export async function PlayQrCode({ url }: { url: string }) {
  "use cache";
  cacheLife("max");

  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#0D0D10", light: "#FFFFFF" },
  });

  return (
    <div
      className="qr"
      role="img"
      aria-label="QR code to download Quizzly from Google Play"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
