import { StyleSheet, useColorScheme } from 'react-native';

// Every color the app uses, by job. Screens ask for "surface" or "textMuted"
// rather than a hex code, so light and dark mode each get their own values.
export type Colors = {
  background: string; // behind everything
  surface: string; // cards, forms, tiles
  border: string; // card outlines
  divider: string; // thin lines between rows
  text: string; // main text
  textSecondary: string; // supporting text
  textMuted: string; // hints, captions
  placeholder: string; // empty text box hint
  inputBorder: string;
  track: string; // empty part of progress bars, small buttons
  segment: string; // tab switcher background
  segmentActive: string; // selected tab
  primary: string; // "+ Add spool" button
  scan: string; // "Scan box" button
  onAccent: string; // text on primary/scan/badge colors
  mutedButton: string; // "Cancel" buttons
  good: string; // full-ish progress bar
  warning: string; // LOW badge and bar
  warningText: string; // warning messages as text
  danger: string; // delete, errors
  chart: string; // report bars
  chartSelected: string; // background behind the tapped month
  axis: string; // chart baseline
  noticeKnownBg: string; // "recognized barcode" note
  noticeKnownText: string;
  noticeNewBg: string; // "new barcode" note
  noticeNewText: string;
};

export type Theme = { dark: boolean; colors: Colors };

const light: Theme = {
  dark: false,
  colors: {
    background: '#f6f6f6',
    surface: '#ffffff',
    border: '#e5e5e5',
    divider: '#f0f0f0',
    text: '#111111',
    textSecondary: '#555555',
    textMuted: '#777777',
    placeholder: '#9a9a9a',
    inputBorder: '#cccccc',
    track: '#eeeeee',
    segment: '#e8e8e8',
    segmentActive: '#ffffff',
    primary: '#2d6cdf',
    scan: '#1e8a5a',
    onAccent: '#ffffff',
    mutedButton: '#666666',
    good: '#27ae60',
    warning: '#c25400',
    warningText: '#975a00',
    danger: '#c0392b',
    chart: '#2a78d6',
    chartSelected: '#eef4fc',
    axis: '#cccccc',
    noticeKnownBg: '#e8f6ee',
    noticeKnownText: '#1e7a46',
    noticeNewBg: '#eaf1fd',
    noticeNewText: '#1f4fa8',
  },
};

const dark: Theme = {
  dark: true,
  colors: {
    background: '#121212',
    surface: '#1e1e1e',
    border: '#2e2e2e',
    divider: '#2a2a2a',
    text: '#f2f2f2',
    textSecondary: '#bdbdbd',
    textMuted: '#8f8f8f',
    placeholder: '#6f6f6f',
    inputBorder: '#444444',
    track: '#333333',
    segment: '#2a2a2a',
    segmentActive: '#444444',
    primary: '#3a78e6',
    scan: '#20935f',
    onAccent: '#ffffff',
    mutedButton: '#9a9a9a',
    good: '#2fb36a',
    warning: '#c25400',
    warningText: '#f0a54a',
    danger: '#f06a5d',
    chart: '#3987e5',
    chartSelected: '#1d2a3b',
    axis: '#444444',
    noticeKnownBg: '#15301f',
    noticeKnownText: '#86d8a6',
    noticeNewBg: '#16243d',
    noticeNewText: '#97bbf7',
  },
};

// The current theme. Follows the phone's light/dark setting and updates live
// when it changes.
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

// Builds a style sheet from the theme's colors and returns a hook that gives the
// right version for the current mode. Each version is built once and reused.
//
//   const useStyles = themedStyles((c) => ({ card: { backgroundColor: c.surface } }));
//   function MyComponent() { const styles = useStyles(); ... }
export function themedStyles<T extends StyleSheet.NamedStyles<T>>(factory: (c: Colors) => T) {
  const cache = new Map<Colors, T>();
  return function useStyles(): T {
    const { colors } = useTheme();
    let styles = cache.get(colors);
    if (!styles) {
      styles = StyleSheet.create(factory(colors));
      cache.set(colors, styles);
    }
    return styles;
  };
}
