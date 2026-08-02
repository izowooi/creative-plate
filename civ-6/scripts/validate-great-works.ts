import {
  auditGreatWorkDocuments,
  expectedGreatWorkCounts,
  greatWorkDocumentAuditErrors,
  greatWorkTypes,
  loadGreatWorksCatalog,
  validateGreatWorkCreatorDocuments,
} from "./great-work-utils";

function usage() {
  console.log("Usage: tsx scripts/validate-great-works.ts [--check] [--missing]");
  console.log("  default     catalog와 작성된 Markdown을 검사하고 누락은 coverage로만 보고");
  console.log("  --check     166개 Markdown이 모두 있어야 통과하는 최종 gate");
  console.log("  --missing   누락된 catalog path를 모두 출력");
}

function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(["--check", "--missing", "--help"]);
  const unknown = args.filter((argument) => !allowed.has(argument));
  if (unknown.length) throw new Error(`알 수 없는 option: ${unknown.join(", ")}`);
  if (args.includes("--help")) {
    usage();
    return;
  }

  const requireComplete = args.includes("--check");
  const showMissing = args.includes("--missing");
  const catalog = loadGreatWorksCatalog();
  const creatorErrors = validateGreatWorkCreatorDocuments(catalog);
  if (creatorErrors.length) {
    throw new Error(`Great Work creator mapping validation failed:\n- ${creatorErrors.join("\n- ")}`);
  }

  const audit = auditGreatWorkDocuments(catalog);
  console.log("Civilization VI Great Works catalog schema v1 is valid.");
  console.log(`- catalog records: ${catalog.records.length}/${expectedGreatWorkCounts.records}`);
  console.log(`- explicit creator mappings: ${Object.keys(catalog.creatorMap).length}/${expectedGreatWorkCounts.creators}`);
  console.log("Great Works editorial coverage");
  for (const type of greatWorkTypes) {
    const count = audit.countsByType[type];
    console.log(`- ${type}: ${count.present}/${count.total}`);
  }
  console.log(`- total: ${audit.present.length}/${audit.catalogTotal}`);

  if (audit.missing.length) {
    console.log(`- missing: ${audit.missing.length}`);
    if (showMissing) {
      console.log("Missing catalog paths");
      for (const type of greatWorkTypes) {
        const paths = audit.missing.filter((record) => record.type === type).map((record) => record.path);
        if (!paths.length) continue;
        console.log(`- ${type} (${paths.length})`);
        for (const missingPath of paths) console.log(`  - ${missingPath}`);
      }
    } else if (!requireComplete) {
      console.log("  report mode에서는 누락을 허용합니다. 전체 목록은 --missing으로 확인하세요.");
    }
  } else {
    console.log("- missing: 0");
  }

  const errors = greatWorkDocumentAuditErrors(audit, { requireComplete });
  if (errors.length) {
    throw new Error(`Great Works document validation failed:\n- ${errors.join("\n- ")}`);
  }
  if (requireComplete) console.log("Great Works final gate passed: 166/166 Markdown documents.");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
