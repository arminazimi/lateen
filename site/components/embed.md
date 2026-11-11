---
title: Embed
description: A video or another page in a lazy iframe with a required accessible title.
layout: doc
permalink: /components/embed/
redirect_from:
  - /blocks/embed/
---

An embed puts a page in a fixed 16:9 frame: a video, a slide deck, or another interactive page. The iframe loads lazily, sends no referrer beyond the origin, and asks for only the permissions an embed normally needs.

## Syntax

```markdown
::embed{src="https://www.youtube.com/watch?v=aqz-KE-bpKQ" title="Big Buck Bunny"}
```

## Options

| Name | Type | Required | What it does |
| --- | --- | --- | --- |
| `src` | `https` URL | yes | The page to embed. A YouTube watch, short, or share link becomes the privacy-friendly `youtube-nocookie.com` embed. |
| `title` | string | yes | The frame's accessible name. Without it the component renders a message instead of the frame. |

Only `https` addresses are embedded. An empty or unsafe `src` renders nothing.

## Example

::embed{src="https://www.youtube.com/watch?v=aqz-KE-bpKQ" title="Big Buck Bunny"}

## Loading and failures

The button requests the frame only after a click. While the frame loads, the box keeps the title and a live status line, so the reader is never left with an unexplained empty frame. If the provider is blocked, reports an error, or does not answer within 15 seconds, the box says so, the same button becomes **Retry embed**, and the link to the provider stays visible. Nothing about the choice is stored: a reload starts from the button again.

## Notes

- Always give a title that names the content, not the provider: "Big Buck Bunny", not "YouTube video".
- The embed is for content that needs its own frame. For a link to a video, use an ordinary link; it is lighter and works offline.
- The frame keeps the 16:9 ratio from its CSS and needs no width or height in the directive.
