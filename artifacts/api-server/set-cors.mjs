import { Storage } from "@google-cloud/storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

const bucketName = "replit-objstore-af3326a3-357e-48fb-8aca-791f18a49118";

const corsConfig = [
  {
    origin: ["*"],
    method: ["GET", "PUT", "POST", "HEAD", "OPTIONS"],
    responseHeader: ["Content-Type", "Content-Length", "Authorization", "x-goog-*"],
    maxAgeSeconds: 3600,
  },
];

try {
  await storage.bucket(bucketName).setCorsConfiguration(corsConfig);
  console.log("CORS configured successfully!");
  const [metadata] = await storage.bucket(bucketName).getMetadata();
  console.log("Current CORS:", JSON.stringify(metadata.cors, null, 2));
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
}
