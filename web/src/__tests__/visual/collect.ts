/**
 * What the page looks like, read from the page itself.
 *
 * `snapshot` is handed to page.evaluate, so it has to stand alone: no imports,
 * no module-level constants, everything it needs declared inside. It only
 * reads — every assertion is made back in Node, where the palette and the token
 * names are (see design.md, "Сбор в браузере, утверждения в Node").
 */

/** One rendered element, as far as the skin is concerned. */
export interface ElementStyles {
  /** chain of ancestors down to this element, for the failure message */
  readonly path: string;
  /** the element's own classes, minus Mantine's hashed ones */
  readonly classes: readonly string[];
  /**
   * data-* attributes, name to value. Mantine marks state with these rather than
   * with classes — the option a dropdown has chosen is [data-checked], and which
   * class it carries depends on the component that opened the list.
   */
  readonly data: Readonly<Record<string, string>>;
  /** shown as unavailable, however this element spells that */
  readonly disabled: boolean;
  /** the window colour group this element sits in */
  readonly theme: string;
  /** text belonging to this element rather than to a child, trimmed and cut short */
  readonly ownText: string;
  /** computed colour-bearing declarations, property to raw value */
  readonly colours: Readonly<Record<string, string>>;
  readonly textShadow: string;
  /** the game's font ships in one face, so anything but 400 is a synthesised bold */
  readonly fontWeight: string;
  readonly height: number;
  readonly paddingTop: string;
  readonly paddingBottom: string;
  /** content taller than the box, with overflow-y letting it scroll */
  readonly scrollsY: boolean;
  /** content wider than the box, with overflow-x letting it scroll */
  readonly scrollsX: boolean;
}

/** Computed values of the skin tokens on one theme carrier. */
export type ThemeTokens = Readonly<Record<string, string>>;

export interface Snapshot {
  readonly url: string;
  /** value of data-window on <html>, '' when the base theme is in force */
  readonly window: string;
  readonly elements: readonly ElementStyles[];
  /** window colour group to the computed tokens of that group */
  readonly themes: Readonly<Record<string, ThemeTokens>>;
}

/**
 * Collects the snapshot. Runs in the browser.
 */
export function snapshot(): Snapshot {
  const DIRECT = ['color', 'background-color', 'text-decoration-color', 'accent-color'];
  const EDGES = ['top', 'right', 'bottom', 'left'];
  /* Values holding more than one colour. Kept in step with COMPOUND in
     findings.ts, which takes them apart — this function is serialised into the
     page, so the two lists cannot be one. */
  const COMPOUND = ['background-image', 'box-shadow', 'text-shadow', 'scrollbar-color'];
  /* A scrollbar of the game is a sunken track with a raised thumb, and the skin
     paints it through pseudo-elements — which no querySelectorAll can reach, so
     they are asked for by name on the element that owns the bar. */
  const SCROLLBAR_PARTS = [
    '::-webkit-scrollbar',
    '::-webkit-scrollbar-track',
    '::-webkit-scrollbar-thumb',
    '::-webkit-scrollbar-corner',
  ];
  /* fill defaults to black on every SVG element, container included — and a <g>
     or an <svg> paints nothing, so reading their fill reports a colour nobody
     can see. Only the shapes that draw are asked. */
  const SVG_SHAPES = [
    'path',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'text',
    'tspan',
    'textpath',
    'use',
  ];
  /* Tokens the checks compare against. Read off each theme carrier rather than
     off :root: a var() inside a custom property is substituted where the
     property is declared, so only the carrier holds its own theme's values. */
  const TOKENS = [
    '--skin-window',
    '--skin-text',
    '--skin-muted',
    '--skin-disabled',
    '--skin-hatch',
    '--skin-button-hatch',
    '--skin-list-bg',
    '--skin-list-text',
    '--skin-tooltip-bg',
    '--skin-tooltip-text',
    '--skin-field-bg',
    '--skin-field-text',
  ];

  /* `auto`, `none` and a fully transparent colour say "nothing painted here";
     collecting them would bury the snapshot in values no check ever looks at. */
  const paintsSomething = (value: string) => {
    const text = value.trim().toLowerCase();
    if (text === '' || text === 'auto' || text === 'none' || text === 'transparent') return false;
    return !/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)$/.test(text);
  };

  const scrolls = (style: CSSStyleDeclaration, axis: 'x' | 'y', over: number) => {
    const overflow = axis === 'y' ? style.overflowY : style.overflowX;
    return over > 1 && (overflow === 'auto' || overflow === 'scroll');
  };

  /* Mantine puts a hashed class on every element (m_811560b9); the readable one
     beside it is what says which component this is. */
  const namedClasses = (el: Element) =>
    Array.from(el.classList).filter((name) => !/^m_[0-9a-f]{6,}$/.test(name));

  const step = (el: Element) => {
    const classes = namedClasses(el).slice(0, 2);
    const name = el.tagName.toLowerCase();
    /* State that changes how a widget is drawn goes into the path: it makes the
       failure message say which one of four identical-looking options is meant,
       and it lets a check pick, say, the option that is NOT the chosen one. */
    const state =
      (el.matches('[data-checked]') ? '[checked]' : '') +
      (el.matches(':disabled, [data-disabled]') ? '[disabled]' : '');
    return (classes.length ? `${name}.${classes.join('.')}` : name) + state;
  };

  const pathOf = (el: Element) => {
    const parts: string[] = [];
    for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
      parts.unshift(step(node));
    }
    return parts.join(' > ');
  };

  const tokensOf = (el: Element) => {
    const style = getComputedStyle(el);
    const tokens: Record<string, string> = {};
    for (const token of TOKENS) tokens[token] = style.getPropertyValue(token).trim();
    return tokens;
  };

  const themes: Record<string, ThemeTokens> = {};
  const root = document.documentElement;
  themes[root.dataset.window || 'grey'] = tokensOf(root);
  for (const carrier of document.querySelectorAll<HTMLElement>('[data-window]')) {
    const group = carrier.dataset.window;
    if (group && !(group in themes)) themes[group] = tokensOf(carrier);
  }

  const scroller = document.scrollingElement ?? root;
  const pageScrolls =
    scroller.scrollHeight - scroller.clientHeight > 1 ||
    scroller.scrollWidth - scroller.clientWidth > 1;

  const elements: ElementStyles[] = [];
  for (const el of document.querySelectorAll('*')) {
    // a colour nobody can see is not a colour of the interface
    if (!el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const style = getComputedStyle(el);
    const colours: Record<string, string> = {};

    const ownText = Array.from(el.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? '')
      .join(' ')
      .trim()
      .slice(0, 60);
    const value = el instanceof HTMLInputElement ? el.value : '';
    /* `color` is inherited, so on a wrapper it only repeats the parent's. It is
       collected where the colour is actually put to use: on text of its own, on
       a form control (whose text the browser draws), on an SVG shape that may
       paint with currentColor — and wherever a rule set a colour of its own,
       which is how a dropdown option is caught: its lettering sits in a child
       node, so it has no text of its own to go by. */
    const parent = el.parentElement;
    const assignsColour =
      parent !== null && getComputedStyle(parent).color !== style.color;
    const paints =
      ownText !== '' ||
      value !== '' ||
      assignsColour ||
      el instanceof HTMLInputElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof SVGElement;

    for (const property of DIRECT) {
      if (property === 'color' && !paints) continue;
      // an underline is only drawn when there is a line to draw
      if (property === 'text-decoration-color' && style.textDecorationLine === 'none') continue;
      const declared = style.getPropertyValue(property);
      if (paintsSomething(declared)) colours[property] = declared;
    }
    for (const edge of EDGES) {
      const width = parseFloat(style.getPropertyValue(`border-${edge}-width`));
      const kind = style.getPropertyValue(`border-${edge}-style`);
      if (width > 0 && kind !== 'none') {
        const declared = style.getPropertyValue(`border-${edge}-color`);
        if (paintsSomething(declared)) colours[`border-${edge}-color`] = declared;
      }
    }
    if (
      parseFloat(style.outlineWidth) > 0 &&
      style.outlineStyle !== 'none' &&
      paintsSomething(style.outlineColor)
    ) {
      colours['outline-color'] = style.outlineColor;
    }
    if (el instanceof SVGElement && SVG_SHAPES.includes(el.tagName.toLowerCase())) {
      const fill = style.getPropertyValue('fill');
      if (paintsSomething(fill) && parseFloat(style.getPropertyValue('fill-opacity')) > 0) {
        colours.fill = fill;
      }
      const stroke = style.getPropertyValue('stroke');
      if (
        paintsSomething(stroke) &&
        parseFloat(style.getPropertyValue('stroke-width')) > 0 &&
        parseFloat(style.getPropertyValue('stroke-opacity')) > 0
      ) {
        colours.stroke = stroke;
      }
    }
    for (const property of COMPOUND) {
      const declared = style.getPropertyValue(property);
      if (paintsSomething(declared)) colours[property] = declared;
    }

    /* Only where a bar is actually drawn: a pseudo-element of an element that
       never scrolls still reports colours, and they would drown the snapshot in
       bars nobody can see. The document's own bar hangs off <html>, whose
       overflow stays `visible`, so it is asked about separately. */
    const ownsBar =
      scrolls(style, 'y', el.scrollHeight - el.clientHeight) ||
      scrolls(style, 'x', el.scrollWidth - el.clientWidth) ||
      (el === root && pageScrolls);
    if (ownsBar) {
      for (const part of SCROLLBAR_PARTS) {
        const bar = getComputedStyle(el, part);
        for (const property of ['background-color', ...EDGES.map((e) => `border-${e}-color`)]) {
          const declared = bar.getPropertyValue(property);
          if (paintsSomething(declared)) colours[`${part} ${property}`] = declared;
        }
      }
    }

    elements.push({
      path: pathOf(el),
      classes: namedClasses(el),
      data: Object.fromEntries(
        Array.from(el.attributes)
          .filter((attribute) => attribute.name.startsWith('data-'))
          .map((attribute) => [attribute.name.slice(5), attribute.value]),
      ),
      disabled: el.matches(':disabled, [data-disabled], [aria-disabled="true"]'),
      theme: el.closest<HTMLElement>('[data-window]')?.dataset.window || 'grey',
      ownText,
      colours,
      textShadow: style.textShadow,
      fontWeight: style.fontWeight,
      height: rect.height,
      paddingTop: style.paddingTop,
      paddingBottom: style.paddingBottom,
      scrollsY: scrolls(style, 'y', el.scrollHeight - el.clientHeight),
      scrollsX: scrolls(style, 'x', el.scrollWidth - el.clientWidth),
    });
  }

  return { url: location.pathname, window: root.dataset.window || '', elements, themes };
}
