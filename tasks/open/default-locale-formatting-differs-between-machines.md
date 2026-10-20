# Formatting that uses the default locale renders differently on a developer machine and on CI

**Status:** open · opened 2026-10-20 · measured on one Windows machine; CI's locale not measured, only assumed

The test harness pins the time zone (`tests/setup/hermeticRuntime.ts`) but not the locale, and
`src/` formats with the default locale in several places: `toLocaleString()` in
`RehabNeedsSection` and the bulletin length message, `toLocaleTimeString()` and
`toLocaleDateString()` in `AuditLogViewer`.

On the machine this was measured on, Node's default locale is `en-MY`: `(1250.5).toLocaleString()`
gives `1,250.5`, as `en-US` does, but `new Date(0).toLocaleTimeString()` gives `7:30:00 am` where
`en-US` gives `7:30:00 AM`. Setting `LANG` or `LC_ALL` does not change it there (still `en-MY`), so
the locale cannot be pinned through the environment the way the time zone is. No test asserts a
default-locale string today, which is why both runs agree.

It matters beyond tests: a server render and a browser with different locales can format the same
value two ways, which React reports as a hydration mismatch.

**Settles when:** `src/` passes an explicit locale wherever it formats for display (then a test
can pin the output), or the harness pins the default locale and a test proves it holds on Windows
and Linux; or the owner decides default-locale formatting is acceptable.
