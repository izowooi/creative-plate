export class AppError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "APP_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function appError(message: string, status = 500, code = "APP_ERROR"): AppError {
  return new AppError(message, status, code);
}

export function errorInfo(error: unknown): { message: string; status: number; code: string } {
  if (error instanceof AppError) return { message: error.message, status: error.status, code: error.code };
  if (error && typeof error === "object") {
    const anyError = error as { message?: unknown; status?: unknown; code?: unknown };
    return {
      message: typeof anyError.message === "string" ? anyError.message : String(error),
      status: typeof anyError.status === "number" ? anyError.status : 500,
      code: typeof anyError.code === "string" ? anyError.code : "APP_ERROR",
    };
  }
  return { message: String(error), status: 500, code: "APP_ERROR" };
}
