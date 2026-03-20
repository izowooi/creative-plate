import { cookies } from "next/headers";

const COOKIE_NAME = "pixel-parfait-session";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

function getEncoder() {
  return new TextEncoder();
}

function arrayBufferToBase64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

async function signValue(value: string, secret: string) {
  const encoder = getEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return arrayBufferToBase64Url(signature);
}

async function getExpectedCookieValue() {
  const password = process.env.APP_ACCESS_PASSWORD;
  const sessionSecret = process.env.APP_SESSION_SECRET;

  if (!password || !sessionSecret) {
    return null;
  }

  return signValue(password, sessionSecret);
}

export function isAuthConfigured() {
  return Boolean(process.env.APP_ACCESS_PASSWORD && process.env.APP_SESSION_SECRET);
}

export async function authenticatePassword(password: string) {
  const configuredPassword = process.env.APP_ACCESS_PASSWORD;

  if (!configuredPassword) {
    return false;
  }

  return password === configuredPassword;
}

export async function isAuthenticated() {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(COOKIE_NAME)?.value;
  const expectedValue = await getExpectedCookieValue();

  return Boolean(sessionValue && expectedValue && sessionValue === expectedValue);
}

export async function requireAuth() {
  return isAuthenticated();
}

export async function setAuthCookie() {
  const cookieStore = await cookies();
  const expectedValue = await getExpectedCookieValue();

  if (!expectedValue) {
    throw new Error("인증 환경 변수가 구성되지 않았습니다.");
  }

  cookieStore.set(COOKIE_NAME, expectedValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
