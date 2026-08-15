from datetime import UTC, datetime

import pytest

from remind_prompt.importer import (
    ImportDocument,
    ImportValidationError,
    extract_candidates,
)

NOW = datetime(2026, 8, 15, 3, tzinfo=UTC)  # 12:00 in Seoul


def test_relative_month_uses_source_time_and_clamps_calendar_day() -> None:
    document = ImportDocument(
        "task-summary-2026-01-31T10-30-00.md",
        "# 결제 모델 점검\r\n\r\n## 요청\r\n- 다음 달에 가격 실험을 검토해 주세요. 🚀",
    )

    candidates = extract_candidates([document], now=NOW)

    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate.trigger_type == "relative"
    assert candidate.due_at == datetime(2026, 2, 28, 1, 30, tzinfo=UTC)
    assert candidate.due_local == "2026-02-28T10:30:00"
    assert candidate.title == "결제 모델 점검"
    assert "🚀" in candidate.prompt_text


def test_historical_absolute_date_in_result_is_not_a_candidate() -> None:
    document = ImportDocument(
        "task-summary-2026-08-10.md",
        """# 인증 개선

## 결과
- 2026-08-03에 로그인 배포를 완료했습니다.
- 기존 API는 2026-08-04에 확인했습니다.
""",
    )

    assert extract_candidates([document], now=NOW) == []


def test_absolute_date_before_source_time_is_suppressed_as_provenance() -> None:
    document = ImportDocument(
        "task-summary-2026-08-03T10-00-00.md",
        """# 문서 출처 점검

## 요청
- 원본 문서가 2026-07-31에 작성되었는지 확인해 주세요.
""",
    )

    assert extract_candidates([document], now=NOW) == []


def test_explicit_overdue_past_absolute_action_is_retained() -> None:
    document = ImportDocument(
        "task-summary-2026-08-03T10-00-00.md",
        """# 미완료 제출

## 요청
- 2026-07-31까지 제출해야 했지만 아직 미완료이니 확인해 주세요.
""",
    )

    candidates = extract_candidates([document], now=NOW)

    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate.trigger_type == "absolute"
    assert candidate.due_at == datetime(2026, 7, 31, tzinfo=UTC)
    assert "due_time_precedes_source_time_explicit_overdue" in candidate.warnings


def test_checked_task_is_history_but_unchecked_task_is_actionable() -> None:
    document = ImportDocument(
        "checklist.md",
        """# 체크리스트
- [x] 다음 주에 이전 결과를 확인해 주세요.
- [ ] 다음 주에 새 결과를 확인해 주세요.
""",
        timestamp=NOW,
    )

    candidates = extract_candidates([document], now=NOW)

    assert len(candidates) == 1
    assert "새 결과" in candidates[0].prompt_text


def test_fuzzy_event_and_count_triggers_require_confirmation() -> None:
    document = ImportDocument(
        "task-summary_20260815_090000.md",
        """# 출시 후속 작업

## 요청
- 8월 말에 출시 문구를 검토해 주세요.
- 다음 sync 전에 실험 안건을 정리해 주세요.
- 샘플 7개 완료 후 결과를 공유해 주세요.
""",
    )

    candidates = extract_candidates([document], now=NOW)

    assert [candidate.trigger_type for candidate in candidates] == ["fuzzy", "event", "count"]
    assert all(candidate.requires_confirmation for candidate in candidates)
    assert all(candidate.due_at is None for candidate in candidates)
    assert candidates[1].original_phrase == "다음 sync 전"
    assert candidates[2].original_phrase == "7개 완료 후"


@pytest.mark.parametrize(
    "text",
    [
        "실거래 전략을 검토해 주세요.",
        "전체 결과를 확인해 주세요.",
        "사전자료의 전략 부분을 확인해 주세요.",
    ],
)
def test_korean_words_starting_with_relation_syllable_are_not_events(text: str) -> None:
    document = ImportDocument("words.md", f"# 단어 경계\n## 요청\n- {text}", timestamp=NOW)

    assert extract_candidates([document], now=NOW) == []


@pytest.mark.parametrize(
    ("condition", "expected_phrase"),
    [
        ("다음 sync 전에", "다음 sync 전"),
        ("배포 후에", "배포 후"),
        ("회의 때에", "회의 때"),
        ("마감 전까지", "마감 전"),
    ],
)
def test_event_relation_with_particle_is_recognized(condition: str, expected_phrase: str) -> None:
    document = ImportDocument(
        "event.md",
        f"# 동기화\n## 요청\n- {condition} 안건을 정리해 주세요.",
        timestamp=NOW,
    )

    candidate = extract_candidates([document], now=NOW)[0]

    assert candidate.trigger_type == "event"
    assert candidate.original_phrase == expected_phrase


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("task-summary-2026-01-31T23-45-10.md", datetime(2026, 2, 28, 14, 45, 10, tzinfo=UTC)),
        ("task_summary_20260131_234510.md", datetime(2026, 2, 28, 14, 45, 10, tzinfo=UTC)),
        ("2026.01.31-23.45.10_task-summary.md", datetime(2026, 2, 28, 14, 45, 10, tzinfo=UTC)),
    ],
)
def test_task_summary_filename_timestamp_variants(name: str, expected: datetime) -> None:
    candidates = extract_candidates(
        [ImportDocument(name, "# 검토\n## 요청\n- 한 달 뒤 보고서를 확인해 주세요.")],
        now=NOW,
    )

    assert candidates[0].due_at == expected


def test_body_source_time_metadata_overrides_filename_and_document_timestamp() -> None:
    document = ImportDocument(
        "task-summary-2026-01-01.md",
        "\ufeff# 월말 점검\n**작업 시각:** 2026년 1월 31일 오후 2시 15분\n"
        "## 요청\n- 한 달 뒤 지표를 확인해 주세요.",
        timestamp=datetime(2026, 7, 15, 9, tzinfo=UTC),
    )

    candidate = extract_candidates([document], now=NOW)[0]

    assert candidate.due_local == "2026-02-28T14:15:00"


def test_absolute_date_and_json_safe_preview() -> None:
    document = ImportDocument(
        "notes.md",
        "# 모델 비교\n## 요청\n- 2026년 9월 2일 오후 3시에 결과를 비교해 주세요.",
    )

    candidate = extract_candidates([document], now=NOW)[0]
    payload = candidate.to_dict()

    assert payload["due_at"] == "2026-09-02T06:00:00Z"
    assert payload["due_local"] == "2026-09-02T15:00:00"
    assert payload["destination_label"] == ""
    assert payload["source_ref"] == "notes.md:3"
    assert payload["id"].startswith("import_")
    assert payload["hash"] == candidate.candidate_hash


def test_excerpts_redact_email_tokens_webhooks_and_passwords() -> None:
    slack_webhook = "https://hooks.slack.com" + "/services/TEXAMPLE/BEXAMPLE/REDACT_ME"
    document = ImportDocument(
        "secrets.md",
        "# 비밀 점검\n## 요청\n"
        "- 내일 admin@example.com에게 password=EXAMPLE_ONLY와 "
        "sk-EXAMPLE_REDACT_ME_1234 및 "
        f"{slack_webhook} 값을 확인해 주세요.",
        timestamp=datetime(2026, 8, 15, 9, tzinfo=UTC),
    )

    candidate = extract_candidates([document], now=NOW)[0]

    assert "admin@example.com" not in candidate.prompt_text
    assert "EXAMPLE_ONLY" not in candidate.prompt_text
    assert "sk-EXAMPLE" not in candidate.prompt_text
    assert "hooks.slack.com" not in candidate.prompt_text
    assert "[REDACTED_EMAIL]" in candidate.prompt_text
    assert "[REDACTED]" in candidate.prompt_text


def test_excerpts_redact_aws_credentials_and_secret_assignments() -> None:
    aws_access_key_id = "AKIA" + "EXAMPLEONLY12345"
    document = ImportDocument(
        "cloud-secrets.md",
        "# Cloud 점검\n## 요청\n"
        f"- 내일 AWS_ACCESS_KEY_ID={aws_access_key_id} 및 "
        "AWS_SECRET_ACCESS_KEY=EXAMPLE_AWS_SECRET_VALUE_123456 값을 확인해 주세요.",
        timestamp=datetime(2026, 8, 15, 9, tzinfo=UTC),
    )

    candidate = extract_candidates([document], now=NOW)[0]

    assert aws_access_key_id not in candidate.prompt_text
    assert "EXAMPLE_AWS_SECRET_VALUE_123456" not in candidate.prompt_text
    assert candidate.prompt_text.count("[REDACTED]") == 2


def test_ids_are_stable_for_the_same_source_line() -> None:
    document = ImportDocument(
        "stable.md",
        "# 안정성\n## 요청\n- 다음 주에 회귀 테스트를 실행해 주세요.",
        timestamp=datetime(2026, 8, 15, 9, tzinfo=UTC),
    )

    first = extract_candidates([document], now=NOW)[0]
    second = extract_candidates([document], now=datetime(2027, 1, 1, tzinfo=UTC))[0]

    assert first.id == second.id
    assert first.hash == second.hash


@pytest.mark.parametrize(
    "name",
    ["../secret.md", "/tmp/secret.md", "safe/../../secret.md", r"C:\secret.md"],
)
def test_path_traversal_like_names_are_rejected(name: str) -> None:
    with pytest.raises(ImportValidationError):
        extract_candidates([ImportDocument(name, "# 안전")], now=NOW)


def test_per_document_and_total_utf8_byte_limits() -> None:
    emoji_document = ImportDocument("emoji.md", "😀")
    with pytest.raises(ImportValidationError):
        extract_candidates(
            [emoji_document],
            now=NOW,
            max_document_bytes=3,
            max_total_bytes=3,
        )

    with pytest.raises(ImportValidationError):
        extract_candidates(
            [ImportDocument("one.md", "가"), ImportDocument("two.md", "나")],
            now=NOW,
            max_document_bytes=3,
            max_total_bytes=5,
        )


def test_utf8_bytes_bom_and_emoji_are_preserved() -> None:
    content = "\ufeff# 후속 확인 🔔\r\n## 요청\r\n- 내일 결과를 확인해 주세요. 🧪".encode()

    candidate = extract_candidates(
        [ImportDocument("emoji.md", content, datetime(2026, 8, 15, 1, tzinfo=UTC))],
        now=NOW,
    )[0]

    assert candidate.title == "후속 확인 🔔"
    assert "🧪" in candidate.prompt_text
    assert candidate.source_ref == "emoji.md:3"
