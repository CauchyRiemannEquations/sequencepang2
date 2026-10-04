# SequencePang2 game audio

Integrated 2026-10-04 from the original SequencePang2 audio sketch; revised the same day
to keep gameplay free of background music and generic button beeps. The puzzle rules,
100 stage layouts, progress keys, and release schedule are unchanged.

## Player controls

- Settings are the only sound controls; the separate home sound button is removed.
  The game remains silent until input; a saved legacy effects preference does not enable BGM.
- Settings have master mute, separate BGM/effects switches, and individual volumes.
  `sequencepang2-audio-v1` stores the new preferences. `sequencepang2-sound` is still
  read/written for effects compatibility, with `sequenstar-sound` as legacy fallback.
- Resetting game progress does not reset sound choices.
- Hidden tabs and pagehide suspend playback. Only previously running, authorized
  audio resumes on return. Mobile browsers may require another tap after interruption.

## Event map

| Event | Asset |
|---|---|
| Home/help/completion background | Mango Garden, 38.4s loop |
| Puzzle / next stage / retry / game settings | No BGM |
| Tile selection | select_1 … select_5, 55ms minimum interval |
| Invalid committed path | invalid_soft |
| Nonterminal valid removal | sequence_pop |
| Stars removed during nonterminal move | star_collect |
| Hint actually revealed | mango_hint |
| Menu/button action | No generic click effect |
| Stage clear | 03_stage_clear, 2.8s |
| Failed stage | 04_gentle_retry, 2.1s |
| Last available stage clear | 05_all_stars_complete, 6.2s |

`dist/audio.js` owns one AudioContext and separates music/effects buses. Entering
play immediately stops every music source, including a loop already fading out,
and invalidates pending menu loads. Volume changes, input unlocks, and background
resume while in play cannot start music. Returning home may fade in the menu track
if its saved preference allows it. Result jingles and melodic selection notes remain
available in gameplay; jingles take priority over other one-shots. Ordinary menu
dialogs reduce menu music to 55%. Navigation cancels stale loads and transient sounds.
Short sounds are capped at three simultaneous voices and late effects are dropped.

The supplied play BGM and ui_tap files remain archived assets, but are neither
selected nor preloaded by the game. Removing the home control does not alter any
saved sound or game-progress settings.

## Formats and installed app

Music prefers Ogg Vorbis (~1.9 MB combined), decoded to AudioBuffers with explicit
0…38.4/76.8-second loop bounds. Exact-duration PCM WAV is the fallback for
browsers that cannot decode Ogg (including older iOS versions). It is larger and is
fetched only if Ogg fetch/decoding fails. Jingles and short effects use PCM WAV.
The longer play WAV is resampled to 32 kHz stereo for a smaller legacy-browser download;
its 2,457,600 frames still represent exactly 76.8 seconds. The menu WAV remains 44.1 kHz.
Normal OGG playback uses the delivered 44.1 kHz original. No MP3 encoder padding is used for game loops.

Audio is optional to the PWA shell install. Successful audio requests are cached
lazily in a release-specific cache; heard tracks can then work offline. A track not
yet downloaded needs connectivity once. Audio download/cache/decode failure leaves
the game playable and never consumes a move. Old audio caches are removed with
old app caches when a new worker activates. No hosting security permissions or
external origins were added: Web Audio fetch uses the existing same-origin policy.

## Provenance and validation

Original composition and deterministic synthesis, with no external samples or
soundfonts; see `dist/audio/PROVENANCE.txt`. Audio came from sketch source manifest
`audio-sketch-v1`, based on game source a0b88eda70ebedc1bfe777cfe62b04f6ec18fa36.

Run `npm run build:pwa` and `npm test`. Audio tests cover lifecycle/loading races,
preference migration, stale sounds, and cache behavior. Browser verification uses
real Web Audio decoding/output with mobile-size touch/keyboard interaction and
production CSP. Desktop-emulated Chromium is not a physical iPhone listening test.

References: [Web Audio buffer looping](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/loop),
[Ogg support in Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/).
