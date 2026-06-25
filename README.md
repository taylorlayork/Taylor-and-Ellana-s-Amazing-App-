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
