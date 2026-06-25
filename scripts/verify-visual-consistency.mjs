import { readFileSync } from "node:fs";

const designDoc = readFileSync("DESIGN.md", "utf8");
const appSettingsCss = readFileSync("src/styles/AppSettings.css", "utf8");

const requiredDesignTokens = [
  "Coinbase Blue",
  "surface-soft",
  "hairline",
  "rounded",
];

const forbiddenAppSettingsSelectors = [
  ".room-form-card",
  ".room-list-card",
  ".member-balance-card",
  ".assignment-card",
  ".wallet-card",
  ".transaction-table-card",
  ".friends-list-card",
];

const missingDesignTokens = requiredDesignTokens.filter(
  (token) => !designDoc.includes(token),
);

if (missingDesignTokens.length > 0) {
  throw new Error(
    `DESIGN.md is missing expected design anchors: ${missingDesignTokens.join(", ")}`,
  );
}

const leakedSelectors = forbiddenAppSettingsSelectors.filter((selector) =>
  appSettingsCss.includes(selector),
);

if (leakedSelectors.length > 0) {
  throw new Error(
    `AppSettings.css contains cross-page selectors: ${leakedSelectors.join(", ")}`,
  );
}

const uploadFieldBlock = appSettingsCss.match(
  /\.profile-photo-upload-field input\[type="file"\] \{[\s\S]*?\n\}/,
)?.[0];

if (!uploadFieldBlock) {
  throw new Error("Profile photo upload field styles were not found.");
}

for (const token of [
  "var(--dash-canvas)",
  "var(--dash-hairline)",
  "var(--dash-body)",
]) {
  if (!uploadFieldBlock.includes(token)) {
    throw new Error(`Profile upload field is missing ${token}.`);
  }
}

console.log("Visual consistency checks passed.");
