/**
 * Static integration manifests.
 *
 * Two categories:
 *   1. Platform integrations — server-level credentials checked for env var presence.
 *   2. Provider credential specs — describes what users must supply per deployment provider.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Platform integrations (server-level, operator-managed)
// ─────────────────────────────────────────────────────────────────────────────

export interface PlatformIntegration {
  id: string;
  name: string;
  description: string;
  setupUrl: string;
  enabledFeatures: string[];
  envVarName: string;
  envVarNames?: string[];
  category: "compute_catalog" | "auth" | "notification";
  required: boolean;
}

export const PLATFORM_INTEGRATIONS: PlatformIntegration[] = [
  {
    id: "fly-pricing",
    name: "Fly.io Pricing",
    description: "Live Fly.io compute pricing from the GraphQL API",
    setupUrl: "https://fly.io/user/personal_access_tokens",
    enabledFeatures: ["fly_live_pricing"],
    envVarName: "PRICING_FLY_API_TOKEN",
    category: "compute_catalog",
    required: false,
  },
  {
    id: "runpod-pricing",
    name: "RunPod Pricing",
    description: "Live RunPod GPU pricing from the GraphQL API",
    setupUrl: "https://www.runpod.io/console/user/settings",
    enabledFeatures: ["runpod_live_pricing"],
    envVarName: "PRICING_RUNPOD_API_KEY",
    category: "compute_catalog",
    required: false,
  },
  {
    id: "northflank-pricing",
    name: "Northflank Pricing",
    description: "Live Northflank plan pricing from the REST API",
    setupUrl: "https://app.northflank.com/account/api",
    enabledFeatures: ["northflank_live_pricing"],
    envVarName: "PRICING_NORTHFLANK_API_TOKEN",
    category: "compute_catalog",
    required: false,
  },
  {
    id: "gcp-pricing",
    name: "GCP Pricing",
    description: "Live GCP compute pricing from the Cloud Billing API",
    setupUrl: "https://console.cloud.google.com/apis/credentials",
    enabledFeatures: ["gcp_live_pricing"],
    envVarName: "PRICING_GCP_API_KEY",
    category: "compute_catalog",
    required: false,
  },
  {
    id: "digitalocean-pricing",
    name: "DigitalOcean Pricing",
    description: "Live DigitalOcean droplet pricing from the v2 API",
    setupUrl: "https://cloud.digitalocean.com/account/api/tokens",
    enabledFeatures: ["digitalocean_live_pricing"],
    envVarName: "PRICING_DIGITALOCEAN_TOKEN",
    category: "compute_catalog",
    required: false,
  },
  {
    id: "github-oauth",
    name: "GitHub OAuth",
    description: "Sign in with GitHub",
    setupUrl: "https://github.com/settings/developers",
    enabledFeatures: ["github_login"],
    envVarName: "GITHUB_CLIENT_ID",
    envVarNames: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
    category: "auth",
    required: false,
  },
  {
    id: "google-oauth",
    name: "Google OAuth",
    description: "Sign in with Google",
    setupUrl: "https://console.cloud.google.com/apis/credentials",
    enabledFeatures: ["google_login"],
    envVarName: "GOOGLE_CLIENT_ID",
    envVarNames: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    category: "auth",
    required: false,
  },
  {
    id: "resend",
    name: "Resend Email",
    description: "Magic link email delivery via Resend",
    setupUrl: "https://resend.com/api-keys",
    enabledFeatures: ["magic_link_email"],
    envVarName: "RESEND_API_KEY",
    category: "notification",
    required: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Provider credential specs (user-provided, per deployment)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProviderCredentialSpec {
  providerId: string;
  name: string;
  description: string;
  setupUrl: string;
  requiredEnvVars: string[];
  optionalEnvVars?: string[];
  notes?: string;
}

export const PROVIDER_CREDENTIAL_SPECS: ProviderCredentialSpec[] = [
  {
    providerId: "fly",
    name: "Fly.io",
    description: "Deploy to Fly.io Machines",
    setupUrl: "https://fly.io/user/personal_access_tokens",
    requiredEnvVars: ["FLY_API_TOKEN"],
    notes: "Or run `fly auth login` on the server and use CLI-based auth",
  },
  {
    providerId: "runpod",
    name: "RunPod",
    description: "Deploy to RunPod GPU cloud",
    setupUrl: "https://www.runpod.io/console/user/settings",
    requiredEnvVars: ["RUNPOD_API_KEY"],
  },
  {
    providerId: "northflank",
    name: "Northflank",
    description: "Deploy to Northflank container platform",
    setupUrl: "https://app.northflank.com/account/api",
    requiredEnvVars: ["NORTHFLANK_API_TOKEN"],
  },
  {
    providerId: "e2b",
    name: "E2B",
    description: "Deploy to E2B cloud sandbox",
    setupUrl: "https://e2b.dev/dashboard",
    requiredEnvVars: ["E2B_API_KEY"],
  },
  {
    providerId: "devpod-aws",
    name: "AWS (via DevPod)",
    description: "DevPod development environment on AWS",
    setupUrl: "https://console.aws.amazon.com/iam",
    requiredEnvVars: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_DEFAULT_REGION"],
    optionalEnvVars: ["AWS_SESSION_TOKEN"],
  },
  {
    providerId: "devpod-gcp",
    name: "Google Cloud (via DevPod)",
    description: "DevPod development environment on GCP",
    setupUrl: "https://console.cloud.google.com/iam-admin/serviceaccounts",
    requiredEnvVars: ["GOOGLE_APPLICATION_CREDENTIALS"],
    notes: "Or use `gcloud` CLI auth on the server",
  },
  {
    providerId: "devpod-azure",
    name: "Azure (via DevPod)",
    description: "DevPod development environment on Azure",
    setupUrl: "https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade",
    requiredEnvVars: [
      "AZURE_CLIENT_ID",
      "AZURE_CLIENT_SECRET",
      "AZURE_TENANT_ID",
      "AZURE_SUBSCRIPTION_ID",
    ],
  },
  {
    providerId: "devpod-digitalocean",
    name: "DigitalOcean (via DevPod)",
    description: "DevPod development environment on DigitalOcean",
    setupUrl: "https://cloud.digitalocean.com/account/api/tokens",
    requiredEnvVars: ["DIGITALOCEAN_TOKEN"],
  },
  {
    providerId: "docker",
    name: "Docker",
    description: "Local Docker deployment",
    setupUrl: "",
    requiredEnvVars: [],
    notes: "No credentials required — uses the local Docker daemon",
  },
  {
    providerId: "kubernetes",
    name: "Kubernetes",
    description: "Kubernetes cluster deployment",
    setupUrl: "",
    requiredEnvVars: [],
    optionalEnvVars: ["KUBECONFIG"],
    notes: "Uses ~/.kube/config by default",
  },
];
