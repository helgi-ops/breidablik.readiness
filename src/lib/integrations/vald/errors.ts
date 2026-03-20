export class ValdAuthError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ValdAuthError";
  }
}

export class ValdRateLimitError extends Error {
  constructor(message: string, public readonly retryAfterMs?: number | null) {
    super(message);
    this.name = "ValdRateLimitError";
  }
}

export class ValdApiError extends Error {
  constructor(message: string, public readonly status?: number, public readonly details?: unknown) {
    super(message);
    this.name = "ValdApiError";
  }
}

export class ValdMappingError extends Error {
  constructor(message: string, public readonly payload?: unknown) {
    super(message);
    this.name = "ValdMappingError";
  }
}

export class ValdNormalizationError extends Error {
  constructor(message: string, public readonly payload?: unknown) {
    super(message);
    this.name = "ValdNormalizationError";
  }
}
