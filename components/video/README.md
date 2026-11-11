# Video

A click-to-load video: a 16:9 poster, a play button, and a visible link to the provider. The
provider's player is an iframe that `client.ts` inserts only when the reader clicks the play button,
so the page requests nothing from the provider before then. The poster and the link render without
JavaScript, and the link opens the video in a new tab.

`index.ts` exports the `video` component and the `directive` of the same name. `src` must be an
`https` address; a YouTube watch, short, or share link becomes the privacy-friendly
`youtube-nocookie.com` embed (the helpers come from the `embed` component). `title` is required:
without it the component renders a diagnostic instead, because the player and the button would have
no accessible name. `poster` takes an `https` address or a root-relative path; when it is absent, a
YouTube video uses its provider thumbnail, and any other provider gets a plain surface.

`style.css` keeps the frame at a 16:9 ratio and fills the same box with the iframe, so nothing shifts
when the player replaces the poster. It uses tokens only and logical properties, so it reads the same
in right-to-left pages.

The `html` output ships `client.ts` as an island: it writes the module and loads it with a
`<script type="module">` on every page that uses the component. The island reveals the play button, and
a click swaps the poster for the player. Without JavaScript the button stays hidden and the visible
link opens the video in a new tab. `test/component-video.test.ts` exercises the island with fakes.
