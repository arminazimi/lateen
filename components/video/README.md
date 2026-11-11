# Video

A click-to-load video: a 16:9 poster, a play button, and a visible link to the provider. Nothing
remote is requested before the reader consents. The provider's player is an iframe that `client.ts`
inserts only when the reader clicks the play button. The poster, the captions link, the transcript,
and the provider link render without JavaScript; the link opens the video in a new tab.

`index.ts` exports the `video` component and the `directive` of the same name. `src` must be an
`https` address; a YouTube watch, short, or share link becomes the privacy-friendly
`youtube-nocookie.com` embed (the helpers come from the `embed` component). `title` is required:
without it the component renders a diagnostic instead, because the player and the button would have
no accessible name.

`poster` takes a root-relative path only, so the image comes from the same origin. A provider
thumbnail is never inferred: a YouTube video without an authored poster shows a plain surface. An
`https` poster is rejected, because it would ask a third party before the reader consents.

`captions` takes a WebVTT file as an `https` address or a root-relative path and renders a link
labelled by `captions_label`. `transcript` takes a linked transcript the same way, labelled by
`transcript_label`; the directive body is the inline transcript and wins when both are present. The
body renders as a `<details>` disclosure named by `transcript_label`, or plainly when the label is
missing, so no new text is invented. Captions and the transcript are static markup under the
provider link, so they stay available when the island never runs or the player is blocked.

`style.css` keeps the frame at a 16:9 ratio and fills the same box with the iframe, so nothing shifts
when the player replaces the poster. It uses tokens only and logical properties, so it reads the same
in right-to-left pages.

The `html` output ships `client.ts` as an island: it writes the module and loads it with a
`<script type="module">` on every page that uses the component. The island reveals the play button, and
a click swaps the poster for the player. Without JavaScript the button stays hidden and the visible
link opens the video in a new tab. `test/component-video.test.ts` exercises the island with fakes.
