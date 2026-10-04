# Filament Inventory Manager

A phone app for tracking 3D printer filament: what spools you own, how much is left on each,
what you paid, and when you're running low.

Built with [Expo](https://expo.dev) (React Native + TypeScript). Everything is stored **on your
phone** in a small SQLite database, so there are no servers or accounts to set up.

## What works today

The app has three tabs:

- **In Use:** an **In the AMS** section at the top shows what's loaded in each AMS slot right now
  (slot, color, type and estimated amount left, live from the printer), followed by the spools
  you've opened, with how much is left and quick buttons to log prints
- **Stock:** sealed spools waiting to be used, grouped by material and then by color, with how
  many of each color you have and which brands they are. Tap a color to see each spool, and tap
  **Open** when you load one; it moves to In Use
- **Printer:** live status of your Bambu Lab printer and every AMS slot (material, color, how
  much is left), read through Home Assistant (see "Printer connection" below)
- **Reports:** spending and purchase history (see below)

New spools start sealed, so they land in Stock until you open them.

- Add spools (brand, material, color, weight, price paid)
- **Scan the barcode on a filament box.** The first time, you fill in the details and the app
  remembers that barcode. The next box with the same barcode fills the form in for you, so you
  just check the price and tap Save. Everything is remembered on your phone, with no internet
  lookup.
- See how much is left on each spool, with a progress bar
- Tap **−10 g / −50 g / −100 g** to log filament used by a print
- Spools at or under 200 g are flagged **LOW** (threshold is `LOW_STOCK_THRESHOLD_G` in `src/db.ts`)
- A phone notification pops up the moment a spool drops into the LOW range (the app asks for
  notification permission the first time it opens)
- Cost per kg for each spool, and what the filament you have left is worth
- **Reports tab:** spending this month, this year and all time; a 12-month spending chart
  (tap a month for its total); spending broken down by material and by brand, with average
  price per kg; and a full purchase history. Switch between this year and all time.
- **Mark as used up** (in a spool's edit screen) when a spool runs out. It leaves your
  inventory but stays in purchase history and reports. Use Delete only for mistakes.
- Set the purchase date on any spool, so you can add older purchases
- **Opened date:** record when a spool came out of its sealed bag (handy for knowing when it
  might need drying). It's filled in automatically the first time you log a print, and each
  card shows "Sealed" or how many days ago it was opened
- **Notes** on each spool, e.g. best print temperature or quirks, shown on its card
- **Spool or refill:** mark whether filament came on its own reel or as a refill for a reusable
  spool. Refills get a tag on their card, scanned barcodes remember the choice, and Reports
  compares what you spend on refills vs. spools
- **Dark mode:** follows your phone's light/dark setting automatically, and switches live
  when you change it
- Tap a spool to edit it: fix any detail or set exactly how much filament is left
- **Weigh a spool on a kitchen scale.** Enter the empty reel's weight once, then type the scale
  reading and the app works out the filament left
- Delete a spool from the edit screen, or long-press it in the list

---

## One-time setup on your computer

You only do this once.

1. **Install Node.js (LTS version)** from <https://nodejs.org>. This is the engine that runs the
   development tools. Check it worked by opening a terminal and running `node -v`.
   (On Windows the terminal is "PowerShell", on Mac it's "Terminal".)
2. **Install Git** from <https://git-scm.com>. It's how you download this code and save changes.
3. **Install VS Code** from <https://code.visualstudio.com>. It's a free code editor
   (optional but recommended).
4. **Install the Expo Go app on your phone** from the App Store or Google Play.

## Getting the project running

In a terminal:

```bash
git clone https://github.com/bkfarrell/Filament-Inventory-Manager.git
cd Filament-Inventory-Manager
npm install        # downloads the libraries the app uses (takes a minute)
npx expo start     # starts the development server
```

A QR code appears in the terminal. Then:

- **iPhone:** open the normal Camera app and point it at the QR code.
- **Android:** open Expo Go and tap "Scan QR code".

The app opens on your phone. **When you save a file on your computer, the phone updates
right away.** That's the main loop you'll use while building.

> **Phone won't connect?** Your phone and computer need to be on the same Wi-Fi network. If that
> still fails (for example on a work or guest network), run `npx expo start --tunnel` instead.

## Where things live

| File | What it does |
| --- | --- |
| `App.tsx` | The main screen: the list of spools, the summary, and the "Add spool" button |
| `src/db.ts` | The database: spools, remembered barcodes ("products"), and functions to read and change them |
| `src/components/BarcodeScanner.tsx` | The camera screen that reads a box's barcode |
| `src/components/StockScreen.tsx` | The Stock tab: sealed spools grouped by material and color |
| `src/stock.ts` | The grouping and counting behind the Stock tab |
| `src/components/AmsSection.tsx` | The "In the AMS" section at the top of In Use |
| `src/components/TrayRow.tsx` | How one AMS slot is shown (used on In Use and Printer) |
| `src/usePrinter.ts` | Reads the printer every 15 seconds while a screen shows it |
| `src/components/PrinterScreen.tsx` | The Printer tab: Home Assistant connection, printer status, AMS slots |
| `src/homeAssistant.ts` | Talks to Home Assistant and recognizes the Bambu Lab printer and AMS entities |
| `src/components/ReportsScreen.tsx` | The Reports tab: totals, monthly chart, breakdowns, purchase history |
| `src/reports.ts` | The math behind the reports (totals by month, brand, material) |
| `src/theme.ts` | All the app's colors for light and dark mode. Change a color here and it updates everywhere |
| `src/notifications.ts` | Asks for notification permission and sends the "running low" alert |
| `src/components/SpoolCard.tsx` | How a single spool looks in the list |
| `src/components/SpoolForm.tsx` | The form for adding and editing a spool, including the scale calculator |
| `app.json` | App name, icon, and other settings |
| `assets/` | App icon and splash images |

## Printer connection (Bambu Lab via Home Assistant)

The Printer tab reads your printer through Home Assistant's
[Bambu Lab integration](https://github.com/greghesp/ha-bambulab) (installed via HACS), so the app
never talks to the printer directly.

1. In Home Assistant, click your name (bottom left) → **Security** → **Long-lived access tokens** →
   **Create token**. Copy it.
2. In the app, open **Printer**, enter your Home Assistant address (e.g. `http://192.168.10.5:8123`)
   and paste the token. It's kept in the phone's secure storage.
3. Away from home, it works over Tailscale as long as that address is reachable.

The app finds the printer's entities automatically. If something looks wrong, open **Raw printer
data** at the bottom of the Printer tab and use **Share raw data**.

> For a standalone/TestFlight build: iOS local-network settings are already in `app.json`. Android
> builds that use a plain `http://` address will also need cleartext traffic enabled (via
> `expo-build-properties`).

## Installing on your iPhone (TestFlight)

The project is set up to build in Expo's cloud (EAS) and upload straight to TestFlight, so no Mac
or Xcode is needed. You need an [Apple Developer account](https://developer.apple.com/programs/)
($99/year) and a free [Expo account](https://expo.dev/signup).

```bash
npx eas-cli@latest login
npx eas-cli@latest init                                   # first time only: links an Expo project
npx eas-cli@latest build --platform ios --auto-submit     # build + upload to TestFlight
```

The first build asks to sign in to your Apple account and offers to create certificates and the
App Store Connect app for you; answer yes. When Apple finishes processing (they email you), add
yourself as a tester under **App Store Connect → your app → TestFlight → Internal Testing**, then
install from the TestFlight app. Run the build command again to ship an update.

Settings already in place: bundle ID `com.bkfarrell.filamentinventory` (in `app.json`, permanent
after the first upload), automatic build numbers (`eas.json`), the export-compliance answer, the
app icon, and camera / local network permission messages.

## Useful commands

```bash
npx expo start          # run the app (press "r" in the terminal to reload)
npx tsc --noEmit        # check the code for type errors
npx expo install <pkg>  # add a library (use this instead of "npm install" so versions match Expo)
npx expo-doctor         # diagnose setup problems
```

---

## Roadmap

These are in rough order from easiest to hardest:

1. ~~**Low-stock notifications.**~~ Done.
2. ~~**Edit spools and set the exact weight.**~~ Done.
3. **QR labels.** Generate a QR code per spool to print and stick on it, then scan it with the
   phone camera (`expo-camera`) to open that spool. Works in Expo Go.
4. ~~**Purchase history and cost reports.**~~ Done.
5. **NFC tags.** Tap the phone on a spool's NFC sticker. NFC needs a **development build**,
   because Expo Go doesn't include NFC (see below).
6. **Printer integration.** Pull usage automatically from OctoPrint, Klipper/Moonraker, or Bambu
   Lab. This means talking to the printer over your home network, and it pairs well with the
   NFC work.

### Expo Go vs. a "development build"

Expo Go is a ready-made app that can run your code, and it's all you need for steps 1–4.
Features like NFC need native code that Expo Go doesn't include. For those you build your own
copy of the app with EAS (`npx eas-cli@latest build --profile development`). It's free to start,
and the build runs in the cloud, so you don't need Xcode or Android Studio. Putting the app on
an iPhone without Expo Go needs an Apple Developer account ($99/year). Android is free.
