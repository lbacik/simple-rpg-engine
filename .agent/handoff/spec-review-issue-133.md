# Handoff: SPEC-only diff review agent/issue-133 vs main

## Task
Review `git diff main...HEAD` (branch agent/issue-133, base snapshot: clean, HEAD 8f4d0b9 "Relocate Playthrough validation to Scenario-aware read layer") on SPEC ONLY against ticket acceptance criteria. Return <400-word report with (a) missing/partial, (b) scope creep, (c) implemented-but-wrong, quoting spec line per finding.

## Spec (from caller)
- Store returns raw stored state; validation happens in the Scenario-aware layer.
- Every current caller uses that layer; a test or boundary check makes bypassing it hard.
- Missing Scenario: no state write, Journal still readable.
- Invalid stored state fails validation without being rewritten and without blocking Journal access.
- All existing persistence, turn, Journal and page tests pass unchanged in behaviour.
Callers in scope: Playthrough/Session lists, game page, action (turn) path, standalone and modal Journal views. Invalid/missing must allow historical Journal + safe read-only view, never crash or silent reinterpretation.

## Progress
- No diff examined yet. Both `Bash(git log...)` and `Skill(handoff)` invocations were rejected by PreToolUse hook: "Token soft threshold reached... must invoke handoff skill now".
- Next step for continuation: run `git log main..HEAD --oneline` then `git diff main...HEAD` (single commands, no compounds), then targeted Reads of store/read-layer/callers/tests, then write <400-word spec report as final text (no .md report file).

## Files/refs
- Repo: /data/repo, branch agent/issue-133, HEAD 8f4d0b9.
