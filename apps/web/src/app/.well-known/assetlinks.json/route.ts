import { ANDROID_CERT_SHA256, ANDROID_PACKAGE } from "@/lib/site";

// Android App Links verification (FR-INV-02): lets https://{domain}/i/… and /c/… open the app
// directly. Empty until ANDROID_CERT_SHA256 is set, so Android simply opens the website instead.
export function GET() {
  const statements = ANDROID_CERT_SHA256.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: ANDROID_PACKAGE,
            sha256_cert_fingerprints: ANDROID_CERT_SHA256,
          },
        },
      ]
    : [];
  return Response.json(statements);
}
