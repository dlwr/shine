export class NotFoundError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ValidationError';
  }
}

export class TmdbConfigurationError extends Error {
  constructor(message = 'TMDb API key not configured', options?: ErrorOptions) {
    super(message, options);
    this.name = 'TmdbConfigurationError';
  }
}

export class TmdbDataNotFoundError extends NotFoundError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TmdbDataNotFoundError';
  }
}

export class ExternalFetchError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ExternalFetchError';
  }
}

export class UnprocessableContentError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UnprocessableContentError';
  }
}
