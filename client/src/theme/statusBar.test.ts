import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOP_EDGE_TOKEN, topEdgeFor } from './statusBar';

describe('status bar colour per screen (theme-color)', () => {
  it('sign-in screens use the sign-in bar', () => {
    for (const p of ['/', '/sign-in/email', '/sign-in/mobile', '/sign-in/code', '/forgot-password', '/forgot-password/code']) {
      expect(topEdgeFor(p, false), p).toBe('auth');
    }
  });
  it('Home uses its header: normal or Diwali', () => {
    expect(topEdgeFor('/home', false)).toBe('hero');
    expect(topEdgeFor('/home', true)).toBe('diwali');
  });
  it('the Entry Pass dims the status bar like the page', () => {
    expect(topEdgeFor('/profile/entry-pass', false)).toBe('sheet');
  });
  it('every other screen, staff included, uses the page background', () => {
    for (const p of ['/notifications', '/support', '/support/faqs', '/profile', '/settings', '/m/leave', '/warden', '/admin/users', '/choose', '/homework', '/sign-inx']) {
      expect(topEdgeFor(p, true), p).toBe('page');
    }
  });
  it('every token it reads is defined, in both themes where the theme changes it', () => {
    const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
    const block = (selector: string) => {
      const start = css.indexOf(selector + ' {');
      return css.slice(start, css.indexOf('\n}', start));
    };
    const dark = block(":root[data-theme='dark']");
    const light = block(":root[data-theme='light']");
    for (const token of Object.values(TOP_EDGE_TOKEN)) {
      const decl = new RegExp(`${token}:\\s*#[0-9a-f]{6};`);
      const inRoot = decl.test(css.replace(dark, '').replace(light, ''));
      expect(inRoot || (decl.test(dark) && decl.test(light)), token).toBe(true);
    }
  });
  it('matches the colours measured on the screenshots (§16)', () => {
    const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
    expect(css).toMatch(/--statusbar-auth: #fafafa;/);
    expect(css).toMatch(/--app-bg: #101116;/);
    expect(css).toMatch(/--hero-top: #3d4fd7;/);
    expect(css).toMatch(/--statusbar-sheet: #090a0e;/);
  });
});
