import type { ValdAthleteSummary, ValdProduct, ValdTestSummary, ValdTokenResponse } from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function nestedString(record: Record<string, unknown> | null, ...paths: string[]): string | null {
  if (!record) return null;
  for (const path of paths) {
    const segments = path.split(".");
    let current: unknown = record;
    for (const segment of segments) {
      current = current && typeof current === "object" ? (current as Record<string, unknown>)[segment] : null;
    }
    if (typeof current === "string" && current.trim()) return current.trim();
  }
  return null;
}

export function mapValdTokenResponse(payload: unknown): ValdTokenResponse {
  const record = asRecord(payload) ?? {};
  // VALD (March 2026) returns expires_in (integer seconds), not expires_at.
  // Convert to an absolute ISO timestamp so we can reliably check expiry.
  const expiresIn = typeof record.expires_in === "number" && Number.isFinite(record.expires_in)
    ? record.expires_in
    : null;
  const expiresAt = expiresIn != null
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : firstString(record.expires_at, record.expiresAt);
  return {
    accessToken: firstString(record.access_token, record.accessToken) ?? "",
    refreshToken: firstString(record.refresh_token, record.refreshToken),
    expiresAt,
    raw: payload,
  };
}

/**
 * Infers the VALD product from the testType field returned by the API.
 * VALD ForceDecks test types: CounterMovementJump, SquatJump, DropJump, IMTP, etc.
 * VALD NordBord test types: NordicHamstringCurl, etc.
 * VALD ForceFrame test types: IsometricStrength, etc.
 */
export function inferValdProductFromTestType(payload: unknown): ValdProduct | null {
  const record = asRecord(payload);
  if (!record) return null;
  // External NordBord/ForceFrame send the human name as `testTypeName`
  // ("Nordic", "Ankle IN/EV", …); ForceDecks v2019q3 uses `testType`.
  const testType = firstString(record.testType, record.test_type, record.testTypeName)?.toLowerCase();
  if (!testType) return null;
  // ForceDecks jump / force tests
  if (
    testType.includes("countermovement") ||
    testType.includes("squatjump") ||
    testType.includes("dropjump") ||
    testType.includes("imtp") ||
    testType.includes("sqj") ||
    testType.includes("cmj")
  ) return "forcedecks";
  // NordBord
  if (testType.includes("nordic") || testType.includes("nordbord") || testType.includes("hamstring")) return "nordbord";
  // ForceFrame
  if (testType.includes("forceframe") || testType.includes("force_frame") || testType.includes("isometric")) return "forceframe";
  return null;
}

export function inferValdProductFromPayload(payload: unknown): ValdProduct {
  // First try the structured testType field (VALD REST API v2+)
  const fromTestType = inferValdProductFromTestType(payload);
  if (fromTestType) return fromTestType;

  const record = asRecord(payload);
  // Structural fingerprint of the External NordBord/ForceFrame flat payloads,
  // used when testTypeName is anatomical (e.g. "Ankle IN/EV") and matches no
  // keyword. ForceFrame carries inner/outer paddles + a test position; NordBord
  // carries torque/calibration on a single left/right pair.
  if (record) {
    if (
      "innerLeftMaxForce" in record || "outerLeftMaxForce" in record ||
      "innerRightMaxForce" in record || "testPositionName" in record || "testPositionId" in record
    ) return "forceframe";
    if (
      "leftTorque" in record || "rightTorque" in record ||
      "leftCalibration" in record || "rightCalibration" in record ||
      (("leftMaxForce" in record || "rightMaxForce" in record) && !("trials" in record))
    ) return "nordbord";
  }
  const source = firstString(
    record?.product,
    record?.device,
    record?.productType,
    record?.sourceProduct,
    record?.test_category,
  )?.toLowerCase();
  if (!source) return "unknown";
  if (source.includes("force") && source.includes("deck")) return "forcedecks";
  if (source.includes("nord")) return "nordbord";
  if (source.includes("frame")) return "forceframe";
  return "unknown";
}

export function mapValdAthleteSummary(payload: unknown): ValdAthleteSummary | null {
  const record = asRecord(payload);
  if (!record) return null;
  // VALD External API v2019q3 AthleteItemDTO uses "id" as primary identifier.
  // Older/internal APIs used "profileId" — keep as fallback.
  const athleteId = firstString(record.id, record.profileId, record.athlete_id, record.athleteId);
  if (!athleteId) return null;
  // AthleteItemDTO provides givenName/familyName; internal APIs used firstName/lastName
  const firstName = firstString(record.givenName, record.firstName, record.first_name);
  const lastName = firstString(record.familyName, record.lastName, record.last_name);
  const teamName = firstString(
    record.teamName,
    record.team_name,
    record.squadName,
    record.squad_name,
    record.clubName,
    record.club_name,
    nestedString(record, "team.name"),
    nestedString(record, "teamName.value"),
  );
  const groupName = firstString(
    record.groupName,
    record.group_name,
    record.group,
    record.groupLabel,
    record.group_label,
    record.organisationUnitName,
    record.organizationUnitName,
    record.organisationalUnitName,
    record.teamPath,
    record.team_path,
    nestedString(record, "group.name"),
    nestedString(record, "organisationUnit.name"),
    nestedString(record, "organizationUnit.name"),
  );
  const genderLabel = firstString(
    record.gender,
    record.genderLabel,
    record.gender_label,
    nestedString(record, "gender.name"),
  );
  return {
    athleteId,
    fullName: firstString(record.name, record.fullName, record.full_name) ?? ([firstName, lastName].filter(Boolean).join(" ") || null),
    email: firstString(record.email),
    externalRef: firstString(record.externalId, record.external_ref, record.externalRef, record.reference),
    teamName,
    groupName,
    genderLabel,
    raw: payload,
  };
}

export function mapValdTestSummary(payload: unknown): ValdTestSummary | null {
  const record = asRecord(payload);
  if (!record) return null;
  // VALD External API v2019q3 TestDTO: id (uuid), athleteId (uuid), recordedUTC, lastModifiedUTC
  // Older/cursor API may use testId, profileId, recordedDateUtc, modifiedDateUtc — kept as fallbacks
  const testId = firstString(record.id, record.testId, record.test_id);
  const athleteId = firstString(record.athleteId, record.profileId, record.athlete_id);
  const testTimestamp = firstString(
    record.recordedUTC,       // VALD External API v2019q3 (ForceDecks)
    record.recordedDateUtc,   // older cursor API fallback
    record.testDateUtc,       // External NordBord / ForceFrame /tests/v2
    record.test_timestamp,
    record.testTimestamp,
    record.performed_at,
    record.created_at,
  );
  if (!testId || !athleteId || !testTimestamp) return null;
  return {
    testId,
    athleteId,
    product: inferValdProductFromPayload(payload),
    testType: firstString(record.testType, record.test_type, record.testTypeName, record.protocol, record.name),
    testTimestamp,
    // lastModifiedUTC is the cursor field for incremental sync (VALD External API v2019q3)
    sourceUpdatedAt: firstString(record.lastModifiedUTC, record.modifiedDateUtc, record.updated_at, record.source_updated_at, record.sourceUpdatedAt),
    raw: payload,
  };
}
