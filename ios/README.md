# Fitsss for iOS

A native SwiftUI client for the Fitsss server. It is the same app as the web PWA
(see `../DESIGN.md`, `../AGENTS.md`) with native chrome: the server keeps every rule
(validation, derived fields, generation, taste); the app shows and edits what the
server owns, over `/api/v1`.

## Layout

```
ios/
  Fitsss.xcodeproj         app, share extension and UI test targets. Folders are
                           synchronized: add files on disk, never edit project.pbxproj
                           to add sources.
  Fitsss/                  app entry: FitsssApp (stores), RootView (session gate, tabs)
  FitsssShare/             the share extension (Share → Fitsss → Inspo): its principal
                           class only; the sheet is ShareFeature
  FitsssUITests/           XCUITest harness for walking flows and taking screenshots
  Config/                  the only hand-written Info.plist keys (ATS for local dev, the
                           extension's NSExtension, FitsssKeychainGroup) and the two
                           targets' entitlements (the shared Keychain group)
  Packages/FitsssKit/      everything else, one module per area:
    FitsssCore             models, APIClient, TokenStore, SharedCredentials, the stores,
                           ColorMath, Labels, PictureDownscaler. Foundation + ImageIO only.
    GarmentArt             SVG-subset renderer for garment drawings
    FitsssUI               tokens (Theme), shared components, Silhouette, Toast, Debug/
    ClosetFeature          Closet tab: grid, detail, edit, archive
    AddFlowFeature         cart-style add flow, presented from the Closet tab
    AccountFeature         sign in / sign up, You tab, AI model (You → AI model)
    TodayFeature           Today tab: weather, steering, outfit generation and feedback
    LooksFeature           Looks tab: Saved | Inspo shelves, saved looks and their detail
    StylesFeature          Styles tab: the user's styles, ordered
    InspoFeature           inspiration pictures: shelf, add, detail, restyle from the closet
                           (shown by Looks' Inspo segment and Today's "Restyle a picture")
    TasteFeature           Taste screen (You → Taste notes): learned and written lines
    ShareFeature           the share extension's sheet: reads the share, uploads with the
                           app's session; also in the app as `dev/share`
```

Shared across features: `OutfitsStore`, `LooksStore`, `StylesStore` (FitsssCore),
`OutfitFlatLay` / `OutfitPieceList` (FitsssUI/Outfit.swift), and `TodayIntents` (FitsssUI), which
the Closet's "Style this piece" uses to pin a piece and open Today.

Features depend on `FitsssCore` and `FitsssUI` only, never on each other: where one
feature presents another (Closet presents the add flow), the app passes a view builder
in. All targets compile with Swift 6 and `MainActor` as the default isolation.

## The server contract

All under the server's base URL, JSON, `Authorization: Bearer <token>`.

| Endpoint | |
|---|---|
| `POST /api/auth/sign-in/email` `{email, password}` | token in the `set-auth-token` response header |
| `POST /api/auth/sign-up/email` `{name, email, password}` | same |
| `POST /api/auth/sign-out` | |
| `GET /api/v1/me` | `User` |
| `GET /api/v1/catalog` | `Catalog`, ETag-revalidated; vocabulary + every drawing |
| `GET /api/v1/blocks?includeArchived=true` | `[Block]` |
| `POST /api/v1/blocks` `BlockInput` or `[BlockInput]` | `{created, failed: [{index, errors}]}`, 201 |
| `GET/PATCH/DELETE /api/v1/blocks/:id` | PATCH takes a whole `BlockInput` |
| `POST/DELETE /api/v1/blocks/:id/archive` | archive / restore, returns the `Block` |
| `GET /api/v1/blocks/saves/:key` | what a save with that `Idempotency-Key` stored, or 404 (read-only: "not yet") |
| `POST /api/v1/blocks/saves/:key/abandon` | `{ stored }`: settles a lost save for good; afterwards the key is refused (409) |
| `POST /api/v1/generations` `GenerationRequest` | `GenerationResult`, 201; slow (tens of seconds); 409 `empty_closet`/`too_few_pieces`, 502 model failed, 503 not set up |
| `GET /api/v1/generations/latest` | the last `GenerationResult`, or `null` |
| `POST /api/v1/generations/:id/swap` `{outfitId, slot, toBlockId, fromBlockId?}` | the updated `Outfit` |
| `GET/POST /api/v1/looks`, `GET/PATCH {name}/DELETE /api/v1/looks/:id`, `POST …/:id/wear` | `Look`s; save, wear and remove record taste events server-side |
| `GET/POST /api/v1/styles`, `GET/PATCH/DELETE /api/v1/styles/:id`, `PUT /api/v1/styles/order {ids}` | `Style`s, at most six |
| `POST /api/v1/outfit-events` `OutfitEvent` | 204; `liked`/`disliked` (with a `dislikeReasons` id) feedback |
| `GET /api/v1/weather?lat&lon` | `WeatherSnapshot`, 503 = set it by hand |
| `GET /api/v1/inspos`, `GET/PATCH {styleId?, note?}/DELETE /api/v1/inspos/:id` | `Inspo`s, newest first, without their bytes |
| `POST /api/v1/inspos` bytes as `image/*` (`?sourceUrl=`), or `{url}` | `Inspo`, unread; 201 new, 200 the same picture already there; 413 too big, 422 `fetch_failed`; `?analyze=1` reads it after answering |
| `GET /api/v1/inspos/:id/image` | the picture's bytes, immutable |
| `POST /api/v1/inspos/:id/analyze` | `Inspo`, read and matched to the closet; slow; 502 retry, 503 not set up |
| `POST /api/v1/inspos/:id/restyle {count?, occasion?, weather?}` | `GenerationResult`, 201; slow; errors as generations (an empty closet is 409 before an unread picture's 422); never Today's `latest` |
| `GET /api/v1/taste` | `{overall, byStyle, totalEvents}` |
| `POST /api/v1/taste/refresh {styleId?}` | `TasteProfile`; slow; 409 `too_few_events` |
| `POST /api/v1/taste/lines {styleId?, text, kind}`, `DELETE /api/v1/taste/lines/:id?styleId=` | `TasteProfile`; the person's own lines (3–120 characters, at most 30 per list, never the same text in both lists), which a refresh keeps; a deleted learned line is never learned again |
| `GET /api/v1/settings/llm`, `PATCH {provider?, effort?, models?: {task: id}}` | `{settings, chosen, pinned, providers, tasks, effortLevels}`: what a model call uses, what the person picked, what the server's environment holds (by variable name), and the vocabulary; PATCH changes only what it names |
| `GET /api/v1/settings/llm/models` | `{models, suggested}`: OpenRouter's models that answer in a schema; empty when OpenRouter can't be reached |
| `POST /api/v1/settings/llm/test {task}` | `{model, ms, sample}`: one small real call; 503 under the mock or without a key, 502 `test_failed`, 429 after 20 real calls in 10 minutes |

**Saving pieces** (`POST /api/v1/blocks`) is idempotent: send an `Idempotency-Key` (a UUID per
batch, persisted with the exact inputs) and resend the same inputs with the same key whenever
the outcome is unknown. Only a 400/422 means "not stored"; a 401, 404, 409, 5xx or no answer
keeps the batch pending. To give up on a pending batch, `…/abandon` its key first. See
`AddFlowFeature/CartStore.swift`.

Responses are `{ "data": … }` or `{ "error": { code, message, errors? } }`; `APIClient`
maps errors to `APIError`. Server source: `src/app/api/v1/`, `src/lib/api/`,
`src/server/catalog-payload.ts`.

## Rules

- **Vocabulary comes from `Catalog`.** Never hard-code a category, type, fit, variant,
  material, pattern, weight or palette list in Swift. Labels too (`catalog.fitLabel` etc.).
- **Never compute derived fields** (warmth, formality, seasons, label). Show what the
  server returned; after a write, show the server's answer.
- **Tokens only.** Colors from `Theme.swift` (they alias the iOS system colors the
  web tokens were modeled on). The only literal colors are a garment's own hex via
  `Color(hex:)`. Type uses the built-in text styles (`.largeTitle` … `.caption`), which
  match the `DESIGN.md` scale and give Dynamic Type for free.
- **Native first.** `NavigationStack` with large titles, `List` `.insetGrouped`,
  `.sheet` with detents, `TabView`, `.searchable`, `.refreshable`, swipe actions,
  context menus, `ContentUnavailableView`, SF Symbols. Custom views only where the web
  design has no system equivalent (swatches, chips, garment tiles, cart pill).
- **DESIGN.md still applies to content**: primary buttons are ink (`.fitsssPrimary`),
  never tint; one accent; no gradients, no decorative glass on content cards, no emoji.
- **No third-party packages.**
- **Tests** only where a silent bug is expensive: the API contract
  (`FitsssCoreTests`), data transformations (cart expansion), parsing. UI is verified by
  running it.

## Building

Every agent or terminal uses its own DerivedData and its own simulator, so parallel
builds do not trample each other:

```bash
# one module (fast, isolates your errors from other modules' work in progress)
cd ios/Packages/FitsssKit
xcodebuild -scheme ClosetFeature -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/fitsss-dd-$NAME build -quiet

# package tests (macOS can't run them; use a simulator)
xcodebuild -scheme FitsssKit-Package -destination "platform=iOS Simulator,id=$UDID" \
  -derivedDataPath /tmp/fitsss-dd-$NAME test -quiet

# the app
cd ios
xcodebuild -project Fitsss.xcodeproj -scheme Fitsss \
  -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath /tmp/fitsss-dd-$NAME build -quiet
```

Simulator (create once, `iPhone 17`, iOS 27):

```bash
UDID=$(xcrun simctl create "Fitsss $NAME" "iPhone 17" com.apple.CoreSimulator.SimRuntime.iOS-27-0)
xcrun simctl boot $UDID && xcrun simctl bootstatus $UDID -b
xcrun simctl install $UDID /tmp/fitsss-dd-$NAME/Build/Products/Debug-iphonesimulator/Fitsss.app
xcrun simctl launch --terminate-running-process $UDID com.lunowe.Fitsss \
  -FitsssLogin dev@fitsss.local:fitsss-dev-1234 -FitsssRoute closet
xcrun simctl io $UDID screenshot /tmp/shot.png
xcrun simctl ui $UDID appearance dark        # or light
```

Launch arguments (`FitsssCore/Networking/LaunchOptions.swift`):

- `-FitsssServer <url>`: server; the simulator defaults to `http://localhost:3100`.
- `-FitsssLogin email:password`: sign in on launch (debug builds).
- `-FitsssRoute a/b/c`: open a screen directly. Each feature documents its routes in
  its root view; `dev/art` opens the drawing gallery, `dev/share…` the share
  extension's sheet (`ShareFeature/ShareSheetDemo.swift`).
- `-FitsssTab today|closet|looks|styles|you`.

Today's UI tests expect location access and a simulated location; grant them once per
simulator: `xcrun simctl privacy $UDID grant location com.lunowe.Fitsss && xcrun simctl location $UDID set 52.52,13.405`.

To tap through a flow, add a test to `FitsssUITests` (it launches signed in) and run
`xcodebuild test -only-testing:FitsssUITests/<Class>/<method> -resultBundlePath /tmp/x.xcresult`.
Export its screenshots with
`xcrun xcresulttool export attachments --path /tmp/x.xcresult --output-path /tmp/x`.

The local server is `pnpm dev` in the repo root (port 3100), seeded with
`dev@fitsss.local` / `fitsss-dev-1234`. Production is
`https://fitsss-production.up.railway.app` (needs the `/api/v1` routes deployed).

## Running on an iPhone

Open `ios/Fitsss.xcodeproj`, select the Fitsss target, Signing & Capabilities, pick your
team (add your Apple ID under Xcode → Settings → Accounts first), connect the phone, Run.
The phone talks to production by default; to use the Mac's dev server instead, set the
server on the You tab to `http://<mac-lan-ip>:3100`.

## Share extension

`FitsssShare` (`com.lunowe.Fitsss.Share`) puts a picture or link shared from Photos,
Pinterest or Safari into Inspo: the picture when the share has one (the shared link
becomes its `sourceUrl`), else the link (`{url}`), always with `?analyze=1` so the server
reads it after answering and the sheet can close at once.

- **Session.** The extension has no sign-in of its own. Whenever someone is signed in the
  app writes `{server, token}` to the Keychain (`FitsssCore/Networking/SharedCredentials.swift`)
  in the access group named by the `FitsssKeychainGroup` Info.plist key,
  `$(AppIdentifierPrefix)com.lunowe.Fitsss.shared`, and deletes it on sign-out. Both
  targets list that group in `keychain-access-groups` (`Config/*.entitlements`); the app
  lists its own group first, so its session tokens (`TokenStore`) stay out of the
  shared one. Signed out, the sheet says "Sign in to Fitsss first, then share again."
- **Memory.** About 120 MB: pictures are scaled from the shared file with ImageIO
  (`PictureDownscaler`), never decoded whole.
- **Seeing it.** `-FitsssRoute dev/share` (and `…/link`, `…/linkfailed`, `…/adding`,
  `…/added`, `…/signedout`) shows the same sheet in the app; `dev/share` really uploads its
  sample with the shared credentials. For the real path, `xcrun simctl addmedia $UDID
  photo.jpg` and run `FitsssUITests/ShareExtensionUITests`, which drives Photos → Share →
  Fitsss and checks the picture arrives.
- **On a phone** the extension needs its own App ID; Xcode's automatic signing makes it.
  iOS gives share extensions a full-height sheet whatever detents they ask for.

The app reloads Inspo whenever it becomes active, so a shared picture is there when you
switch back.

## Isolation

`MainActor` is the default isolation in every module. Plain data (models, `ColorMath`,
parsed drawings, the JSON coders) is marked `nonisolated` so it can be used from tests
and background work; mark new value types the same way.
