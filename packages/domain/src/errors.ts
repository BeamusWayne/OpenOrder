export class DomainError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string) {
    super("not_found", `${entity} not found`, 404);
  }
}

export class SoldOutError extends DomainError {
  readonly skuName: string;

  constructor(skuName: string) {
    super("sold_out", `${skuName} is sold out`, 409);
    this.skuName = skuName;
  }
}

export class ConfirmationRequiredError extends DomainError {
  constructor() {
    super("confirmation_required", "Checkout requires a prior confirmation", 409);
  }
}
