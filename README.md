# Taylor & Ellana's Amazing App! v23

Static shared app for Ingleside, IL and Sydney, NSW.

## v20 updates

- Sydney shared-call availability can start at 6:00 AM local time.
- Ingleside shared-call availability starts at 3:00 PM on Mondays and Wednesdays, and 4:00 PM on other days.
- Clock highlights still show the overlapping shared good windows.
- Clocks are larger and the Time page is tighter so the call timing is visible sooner on phone.
- When it is currently a good shared call window, the countdown area says “CALL EACH OTHER... NOWWW”.
- Forecast day slabs are clickable/tappable and open that day’s larger temperature/rain chart.
- Rain chance chart now includes percentage labels.
- “Differences” tab is now “Extras” and sits on the far right.
- Daily connection cue no longer includes the extra explanatory/current-vibe paragraph.

## Run locally

Double-click `index.html`, or serve it locally:

```bash
py -m http.server 8080
```

Then open `http://localhost:8080`.

If `py` is not available, install Python or use VS Code Live Server.


Version v21: refreshed modern playful color theme with brighter gradients, frosted cards, and updated tab styling.


Version v23: added progressive disclosure for secondary details and smoother app-style animations/transitions while preserving v21 functionality.

Social preview image
--------------------
This build includes a share preview image at `preview-image.png` and Open Graph / Twitter meta tags in `index.html` so pasted links can show a rich preview on services like Facebook, iMessage, and Discord.

If Facebook still shows an older or blank preview after deploy, use the Facebook Sharing Debugger and click "Scrape Again" for your Netlify URL.


v25 update
----------
Clock overlap highlights now render as filled center-out wedges. AM overlap fills the outer 1–12 face, while PM/13–24 overlap stays within the smaller inner circle.


v26 notes
---------
- Bottom tab directory is forced fixed at the bottom on phone screens.
- Desktop/computer clicking is fixed; drag-to-switch still works as a bonus.
- Service worker cache updated to v26.


Version 32
----------
Built from v26, with v27 feature upgrades re-applied except swipe-left/right page switching. Navigation is by bottom tab tap or bottom tab drag/reorder only.

Version 33
----------
- Fixed desktop layout for the active "CALL EACH OTHER... NOWWW" banner so it no longer overlaps nearby text.
- Kept the iPhone/mobile layout unchanged.

v34 update
----------
- Raised the bottom navigation specifically when the site is opened as an iPhone Home Screen app.
- Added a touch-native long-press reorder path for iPhone so press-and-hold dragging works while normal tapping still switches pages.
- Updated cache to v34.


V35 update
----------
- Made the active CALL EACH OTHER... NOWWW alert much punchier with stronger color flashing, glow, and pulse effects.

Version 36
----------
- Desktop bottom navigation is click-first again.
- iPhone bottom navigation no longer rearranges slabs.
- iPhone supports tap-to-open and drag-across-to-switch pages.
- Home Screen app navigation is raised higher for thumb reach.

Version 37 notes
----------------
- Desktop/laptop bottom navigation is click-only and no longer uses mouse pointer capture.
- iPhone still supports tapping a bottom slab and dragging across the bottom bar to switch pages.
- Swipe-left/right page switching remains removed.


Version 38 notes:
- Built from v37.
- Adds the T&E iPhone Home Screen icon files and manifest entries.
- Replaces the social preview image with the simple title-only share image.
- The CALL NOW alert flashes strongly for the first 45 seconds of an open window, can be tapped to calm it immediately, and then stays calm for that same call window.
- iPhone may require deleting and re-adding the Home Screen bookmark to refresh the icon.


Poster Board Supabase setup
---------------------------
1. In Supabase, open your project and go to SQL Editor > New query.
2. Open `supabase-setup.sql` from this ZIP, paste the whole thing, and click Run.
3. Go to Project Settings > Data API.
4. Copy the Project URL and the anon/public key.
5. Open `supabase-config.js` in the website files and paste those values:
   - `url: 'YOUR_PROJECT_URL'`
   - `anonKey: 'YOUR_ANON_PUBLIC_KEY'`
6. Upload/commit the full website again.

After that, the Poster Board tab can post messages, photos, and drawings. New posts are loaded newest-first and Supabase Realtime pushes new posts to the top automatically.


v40 notes: bottom navigation is forced to 5 side-by-side buttons on desktop and iPhone/Home Screen, service-worker cache updated to v40, Supabase config is included as an app-shell asset, and drawing canvas pointer coordinates now scale correctly across the full canvas width.


## v41 Poster Board update
- The newest Poster Board post now appears above the composer at the very top of the Poster Board page.
- The remaining older posts appear below the submission area.
- The poster name defaults to Ellana on a new device/browser and remembers the last selected name in localStorage.
- Posts can be deleted from the board. Re-run `supabase-setup.sql` in Supabase so the new DELETE policies are added.


Version 42 update: Poster Board composer is collapsed by default behind a + Post button; posts now appear below the button with newest first.


## v45 notes
- Rebuilt from the last known-good automated build so weather, holidays/trip ideas, and USD/AUD loading are isolated from Poster Board errors.
- Full-screen drawing now uses a stronger fixed overlay style and click/touch fallback for iPhone Home Screen mode.
- Daily connection cue remains removed.


v46: Replaced the iPhone full-screen drawing behavior with an in-app fixed drawing modal to avoid Safari/Home Screen page jumps or freezes.


Version 47 adds optional notes for photo and drawing posts. Use + Add a note under the photo/drawing tools, including the phone drawing view. Notes are stored in the existing poster_posts.body column, so no new Supabase table change is required beyond the existing Poster Board setup.


## v48 Poster Board activity update
Run the updated `supabase-setup.sql` again. It adds replies, reactions, latest-activity sorting, and realtime tables for replies/reactions.


## v49
- Poster Board author picker is now a Change user button with a Taylor/Ellana popup. Ellana remains the default, and the selected user is saved per device.


## v50
- Fixed Poster Board reaction and reply buttons by wiring their click/submit handlers.
- Fixed the selected Poster Board user so the visible user is the author used for posts/replies/reactions.
- Cleaned up photo/drawing note fields and retained note display on media posts.
- Updated cache to v50.


## v51 updates
- Replaced Home Screen/web app icon PNGs with the smoother readable T&E heart icon.
- Updated Open Graph/Twitter image tags to use the absolute GitHub Pages preview image URL.
- Bumped service worker cache to across-static-v51.


Version 52 updates the public GitHub Pages URL references to https://taylorlayork.github.io/Taylor-and-Ellanas-Amazing-App/ for social previews and cache refreshes.


## v53 notes
- Updated Facebook/Messenger Open Graph image tags to the new GitHub Pages URL with a v53 cache-busting query.
- Replaced browser favicon/icon.svg and PNG icon assets with the smoother T&E icon.
- Added iPhone input anti-zoom styles and viewport settings.


## v54
- Poster Board replies can now include text, photos, GIFs, or the current drawing canvas.
- Replies can be deleted.
- Added 💀 and 😡 reactions.
- New/unread markers stay stable until clicked or until leaving Poster Board.
- iPhone Home Screen icon badging is not included; the app keeps the in-app Poster Board tab badge.
- Run supabase-setup.sql again for the new reply media columns and reaction permissions.


## v55
- Poster Board realtime updates now keep the visible post order static. New activity updates the Poster Board badge only until you click the Poster Board tab or use Refresh live data.
- Reactions/replies no longer yank the post to the top for the current user.
- Leaving Poster Board marks only the posts currently visible as seen; unseen queued activity stays badged until refreshed/viewed.
