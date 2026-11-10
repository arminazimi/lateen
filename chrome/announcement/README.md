# Announcement

A dismissible bar at the top of every page, for a release or an event. The base layout places it above the header;
`index.ts` reads the block and `client.ts` remembers a dismissal.

## Options

```yaml
theme:
  options:
    announcement:
      id: v0-4
      text: Slipway 0.4 is out.
      href: /changelog/
```

- `id` names the announcement in storage. Use a new id for a new announcement so an old dismissal does not hide it.
  It defaults to `announcement`; two bars need two ids.
- `text` is the message. The bar renders nothing when it is missing or empty, and text is always escaped.
- `href` is optional. The text becomes a link; `http`, `https`, `mailto`, and root-relative paths are used, and a
  root-relative path gets the site's `base`. Other schemes are dropped, so a config value cannot inject a script.

## Behaviour

The bar renders in the document, so it is readable without JavaScript. Its dismiss button starts `hidden`; the island
reveals it and stores `slipway-announcement:<id>` in `localStorage` on a click. A later visit reads that key and hides
the bar.

Reading storage needs JavaScript, and the engine's inline theme script is the only non-deferred script a page ships, so
the bar cannot be hidden before the deferred island runs. On a visit after a dismissal the bar is therefore visible for
a moment before the island hides it. Fixing that would need a pre-paint script or a cookie, which the JavaScript budget
and the no-cookie rule do not allow; the one-time hide is the accepted trade-off.
