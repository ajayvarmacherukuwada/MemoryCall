# Memory Archive Architecture Note

- LetsCall owns organization, search, timeline, summaries, and memory metadata.
- ArchiveProvider owns private media storage behind a swappable interface.
- The MVP deliberately opens archived media externally instead of embedding playback inside LetsCall.
- This keeps infrastructure cost near zero and avoids multiple auth surfaces in the app.
- Provider-specific details stay internal so the storage backend can be swapped later without changing the UI.
