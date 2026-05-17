import type { HotspotIcon } from '@/lib/validators';

export type QuickAddTemplate = {
  label: string;
  title: string;
  icon: HotspotIcon;
  instructionsMd: string;
};

// The 80%-case hotspots that show up in nearly every short-term rental.
// Placeholders intentionally point hosts at exactly what to fill in.
export const QUICK_ADD_TEMPLATES: QuickAddTemplate[] = [
  {
    label: 'Wifi',
    title: 'Wifi',
    icon: 'wifi',
    instructionsMd: '**Network:** \n**Password:** \n\nIf wifi drops, hold the button on the back of the router for 10 seconds and let it boot back up.',
  },
  {
    label: 'Trash',
    title: 'Trash day',
    icon: 'trash',
    instructionsMd: '**Pickup day:** \n**Where to leave bins:** \n\nRinse recycling. Bag everything before it goes in the bin.',
  },
  {
    label: 'Washer',
    title: 'Washer / dryer',
    icon: 'appliance',
    instructionsMd: 'Detergent under the sink. Run **Normal** on cold for most loads. Move clothes to the dryer right away — the door doesn\'t latch tightly.',
  },
  {
    label: 'Dishwasher',
    title: 'Dishwasher',
    icon: 'appliance',
    instructionsMd: 'Pods under the sink. Run **Normal**. Detergent door snaps shut — make sure it clicks.',
  },
  {
    label: 'Thermostat',
    title: 'Thermostat',
    icon: 'other',
    instructionsMd: 'Comfortable range: 68–72°F. Please don\'t set below 65°F in winter (pipes).',
  },
  {
    label: 'Parking',
    title: 'Parking',
    icon: 'parking',
    instructionsMd: '**Where to park:** \n**Permit needed:** \n\nStreet sweeping rules — check the signs.',
  },
  {
    label: 'Check-out',
    title: 'Check-out',
    icon: 'key',
    instructionsMd: '**Check-out by:** 11:00 AM\n\nStrip the sheets and leave on the bed. Lock the door behind you — it auto-locks but please double-check.',
  },
];

// A focus check: every keyboard shortcut needs to bail when the host is
// typing into an input, textarea, or contentEditable element.
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export type ShortcutDef = {
  keys: string;
  description: string;
};

// Display-only — actual handlers live inline in the editor where they have
// access to refs and setState. Keep in sync with the listener.
export const KEYBOARD_SHORTCUTS: ShortcutDef[] = [
  { keys: 'Space', description: 'Play / pause' },
  { keys: '← →', description: 'Skip 5 seconds' },
  { keys: 'Shift + ← →', description: 'Skip 1 second' },
  { keys: ', .', description: 'Step ~1 frame back / forward' },
  { keys: 'M', description: 'Add hotspot at current time' },
  { keys: '↑ ↓', description: 'Select previous / next hotspot' },
  { keys: 'Esc', description: 'Close form or shortcut sheet' },
  { keys: '?', description: 'Show this shortcut sheet' },
];

// Assumes 30 fps for the frame-step delta. Browsers don't expose the actual
// frame rate of the loaded video, so this is a pragmatic constant — good
// enough for "nudge by a frame" intent.
export const FRAME_STEP_SECONDS = 1 / 30;
