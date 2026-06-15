export class ApiError extends Error {
  constructor(message, { status = null, body = null, url = "" } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.url = url;
  }
}
