---
title: Video
description: A click-to-load video with a local poster, captions, a transcript, and a provider link that works without JavaScript.
layout: doc
permalink: /components/video/
---

A video shows a poster and a play button, and loads the provider's player only when the reader asks for it. Until then the page makes no request to the provider or its thumbnail CDN. The frame keeps a 16:9 ratio, so nothing shifts when the player replaces the poster. Captions and a transcript sit under the player as static markup, so they remain readable when JavaScript or the player fails.

## Syntax

```markdown
::video{src="https://www.youtube.com/watch?v=aqz-KE-bpKQ" title="Big Buck Bunny" poster="/media/big-buck-bunny.jpg"}
```

A transcript is the body of a container directive:

```markdown
:::video{src="https://www.youtube.com/watch?v=aqz-KE-bpKQ" title="Big Buck Bunny" captions="/media/big-buck-bunny.en.vtt" captions_label="English captions" transcript_label="Transcript"}
The bunny wakes up in a forest and meets the other animals.
:::
```

## Options

| Name | Type | Required | What it does |
| --- | --- | --- | --- |
| `src` | `https` URL | yes | The video page. A YouTube watch, short, or share link becomes the privacy-friendly `youtube-nocookie.com` embed. |
| `title` | string | yes | The player's accessible name. Without it the component renders a message instead of the video. |
| `poster` | local path | no | The image shown before the reader plays. It must be root-relative, so it comes from this site. A remote poster is rejected and a video without one shows a plain surface; the provider thumbnail is never fetched automatically. |
| `captions` | `https` URL or local path | no | A WebVTT captions file. It renders as a link, not a request. |
| `captions_label` | string | with `captions` | The visible and accessible label of the captions link: "English captions", not "here". |
| `transcript` | `https` URL or local path | no | A linked transcript, shown when the directive has no body. |
| `transcript_label` | string | with `transcript` or a body | The label of the transcript disclosure or link. Without it the body is shown plainly and a transcript URL is ignored. |

Only `https` addresses are played, and only safe `https` or root-relative addresses become captions or transcript links. An unsafe `src`, `captions`, or `transcript` value is rejected, and an unsafe poster is ignored.

## Example

::video{src="https://www.youtube.com/watch?v=aqz-KE-bpKQ" title="Big Buck Bunny" poster="/brand/mark-light.svg"}

## Notes

- Give a title that names the content, not the provider: "Big Buck Bunny", not "YouTube video".
- Author the poster locally. A remote image would defeat the consent gate before the reader clicks.
- Pair every captions file or transcript link with a label that says what it is. The component adds no translated text of its own here, so the label reads correctly in the page's language.
- The provider link stays under the box before and after activation, so a failed or blocked player leaves a way through.
- For a link to a video with no player, use an ordinary Markdown link; it is lighter still.
