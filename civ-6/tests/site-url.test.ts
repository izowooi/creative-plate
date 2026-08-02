import assert from "node:assert/strict";
import test from "node:test";
import { getSiteUrl } from "../src/lib/site-url";

test("SITE_URL defaults locally and normalizes a production origin", () => {
  const previous = process.env.SITE_URL;
  try {
    delete process.env.SITE_URL;
    assert.equal(getSiteUrl(), "http://localhost:3000");
    process.env.SITE_URL = "https://history.example.org/some/path/";
    assert.equal(getSiteUrl(), "https://history.example.org");
    process.env.SITE_URL = "ftp://history.example.org";
    assert.throws(() => getSiteUrl(), /http 또는 https/);
  } finally {
    if (previous === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = previous;
  }
});
