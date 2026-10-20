# An escape typed into a generated script can arrive as the character it names

**Learned:** 2026-10-13

The birth-date migration needed JavaScript's whitespace class spelled out inside a PostgreSQL
regular expression: a non-breaking space, the U+2000 run, the two line separators, and so on. It
was typed as backslash-u escapes into a one-shot Node script, inside `String.raw`, so the script
would write the escapes verbatim into `migration.sql`.

The script file was created through the agent's file-writing tool, and that tool decoded the
escapes on the way to disk. `String.raw` then faithfully preserved sixteen literal invisible
characters, and the script pasted them into the SQL six times.

Nothing failed. PostgreSQL matches the literal characters exactly as it matches the escapes, so
the rehearsal went from 92 checks to 102, all green, and the mutation tests went red where they
should. The diff showed a bracket with some spaces in it. A code review found it by reading
bytes. It matters because the file is pasted by hand into a web SQL editor, and editors strip,
normalise or flag exactly these characters, each in its own way, in whichever of the six copies
they touch.

An earlier probe had tested the same class written through a shell heredoc, which does not
decode, so "the escapes work in PostgreSQL" had been measured on text the migration did not
contain.

**Rule:** when a file must contain an escape sequence rather than the character, do not type the
sequence into anything a tool will write for you. Build it at run time from the backslash's
character code, and make the writing script assert the result: grep the output for the escape and
for any non-ASCII byte, and fail on the second. More generally, a test that passes on both the
intended text and the accidental one cannot tell you which you shipped; check the bytes.
