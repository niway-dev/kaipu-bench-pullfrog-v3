import * as stylex from "@stylexjs/stylex";
import { tokens } from "@kaipu/tokens/kaipu.stylex";
import { Fragment, useEffect, useState } from "react";
import type { CSSProperties, FocusEvent, MouseEvent, ReactNode } from "react";
import type { StyleXStyles } from "@stylexjs/stylex";

/**
 * The navigation rail: icon + label items whose active state is a soft accent
 * fill with an indicator bar on the rail's edge, an optional account item and
 * an optional mode toggle pinned to the footer.
 *
 * Three modes (NIW2-626), chosen by the caller:
 * - `expanded-row`: icon and label on one row, ~200px wide, labels 13px/500.
 * - `stacked`: the label under the icon, 64px wide, labels 11px/500. The
 *   default, so a caller that never picks a mode (the landing's mockup) keeps it.
 * - `collapsed`: icons only, 56px wide. Each label stays the link's accessible
 *   name, and a tooltip shows it on hover and on keyboard focus.
 *
 * The rail knows nothing about routing. Each item is handed to `renderLink`,
 * together with the className, style, title, handlers and children it must
 * render, and the caller returns whatever element fits its surface: the desktop
 * returns a router `Link`, a surface with no router returns a plain `<span>`.
 * The active flag is part of the item, computed by the caller, so the rail never
 * has to ask a router anything.
 *
 * It lives in `molecules/` because its items are composed from caller-supplied
 * elements rather than being a leaf.
 */
const styles = stylex.create({
  rail: {
    boxSizing: "border-box",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    flexShrink: 0,
    overflow: "hidden",
    backgroundColor: tokens.bgSidebar,
    borderRightWidth: "1px",
    borderRightStyle: "solid",
    borderRightColor: tokens.border,
    transitionProperty: "width",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  },
  railExpanded: { width: "200px" },
  railStacked: { width: "64px" },
  railCollapsed: { width: "56px" },
  brand: {
    flexShrink: 0,
    // Taller than a nav item: the mark needs air around it, and the
    // extra row height is what stops it reading as just another item.
    height: "64px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: tokens.accentPrimary,
  },
  sections: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "0%",
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    paddingBlock: tokens.spaceSm,
    paddingInline: 0,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spaceXs,
    alignItems: "center",
    width: "100%",
  },
  sectionsRow: { gap: "2px" },
  item: {
    boxSizing: "border-box",
    position: "relative",
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
    backgroundColor: { default: "transparent", ":hover": tokens.bgHover },
    color: { default: tokens.text3, ":hover": tokens.text2 },
    textDecoration: "none",
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${tokens.accentRing}` },
    outlineOffset: "-2px",
    transitionProperty: "background-color, color",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  },
  itemStacked: {
    flexDirection: "column",
    justifyContent: "center",
    gap: "5px",
    // 60px in the 64px rail: the widest labels ("Screenshot", "Shortcuts") fit at 11px.
    width: "60px",
    paddingBlock: "9px",
    paddingInline: 0,
    borderRadius: "11px",
  },
  itemExpanded: {
    flexDirection: "row",
    justifyContent: "flex-start",
    gap: "10px",
    width: "calc(100% - 16px)",
    height: "32px",
    paddingInline: "10px",
    borderRadius: "7px",
  },
  itemCollapsed: {
    justifyContent: "center",
    width: "40px",
    height: "40px",
    borderRadius: "10px",
  },
  // Listed after `item`, so it replaces the hover colours as well: an active
  // item does not change on hover. The label goes white (the readable state);
  // the icon and the bar carry the accent.
  itemActive: {
    backgroundColor: tokens.accentSoft,
    color: tokens.text,
  },
  icon: {
    display: "flex",
    flexShrink: 0,
  },
  iconActive: { color: tokens.accent },
  label: {
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: tokens.fontFamily,
    fontWeight: tokens.fontWeightMedium,
    letterSpacing: 0,
  },
  labelStacked: {
    fontSize: tokens.fontSizeXs,
    lineHeight: "13px",
  },
  labelExpanded: {
    flexGrow: 1,
    fontSize: tokens.fontSizeBase,
    lineHeight: tokens.lineHeightControl,
  },
  // The indicator bar on the rail's left edge, visible only while active. Each
  // mode insets its items differently, so each moves the bar back to the edge;
  // any further out and the rail's overflow clips it.
  bar: {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%) scaleY(0)",
    width: "2px",
    height: "26px",
    borderRadius: "0 2px 2px 0",
    backgroundColor: tokens.accent,
    transitionProperty: "transform",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  },
  barStacked: { left: "-2px" },
  barInset: { left: "-8px", height: "20px" },
  barActive: {
    transform: "translateY(-50%) scaleY(1)",
  },
  // A count on the item's corner: something new is waiting behind it.
  badge: {
    position: "absolute",
    top: "4px",
    right: "6px",
    boxSizing: "border-box",
    minWidth: "16px",
    height: "16px",
    paddingInline: "3px",
    borderRadius: "8px",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: tokens.bgSidebar,
    backgroundColor: tokens.accentPrimary,
    color: "#fff",
    fontFamily: tokens.fontMono,
    fontSize: "8.5px",
    fontWeight: 700,
    lineHeight: "12px",
    textAlign: "center",
  },
  // On a row the count sits at the row's end, like a list's trailing count.
  badgeRow: {
    position: "static",
    flexShrink: 0,
    borderColor: "transparent",
  },
  badgeCollapsed: { top: "1px", right: "1px" },
  srOnly: {
    position: "absolute",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  },
  footer: {
    boxSizing: "border-box",
    flexShrink: 0,
    paddingTop: tokens.spaceSm,
    paddingBottom: tokens.spaceMd,
    paddingInline: 0,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: tokens.border,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: tokens.spaceSm,
    width: "100%",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingInline: "12px",
  },
  avatar: {
    width: "30px",
    height: "30px",
    borderRadius: "50%",
    backgroundColor: tokens.bgCard,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: { default: tokens.border, ":hover": tokens.accentPrimary },
    color: { default: tokens.textSecondary, ":hover": tokens.textPrimary },
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transitionProperty: "border-color, color",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  },
  toggle: {
    width: "28px",
    height: "28px",
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
    borderRadius: "7px",
    backgroundColor: { default: "transparent", ":hover": tokens.bgHover },
    color: { default: tokens.text3, ":hover": tokens.text2 },
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${tokens.accentRing}` },
    transitionProperty: "background-color, color",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  },
  // Fixed, so the rail's own overflow cannot clip it.
  tooltip: {
    position: "fixed",
    zIndex: 1000,
    transform: "translateY(-50%)",
    paddingBlock: "4px",
    paddingInline: "8px",
    borderRadius: "6px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: tokens.lineStrong,
    backgroundColor: tokens.bgActive,
    boxShadow: tokens.shadowPopover,
    color: tokens.text,
    fontFamily: tokens.fontFamily,
    fontSize: tokens.fontSizeSm,
    fontWeight: tokens.fontWeightMedium,
    lineHeight: tokens.lineHeightLabel,
    whiteSpace: "nowrap",
    pointerEvents: "none",
  },
});

/** How the rail lays its items out. See the component's notes. */
export type RailMode = "expanded-row" | "stacked" | "collapsed";
export const RAIL_MODES: readonly RailMode[] = ["expanded-row", "stacked", "collapsed"];

export interface RailItem {
  /** Stable key for the item. */
  id: string;
  /** Already translated; the link's accessible name, title and collapsed tooltip. */
  label: string;
  /** Sized by the caller. */
  icon: ReactNode;
  /** Computed by the caller, since only it knows the current location. */
  active?: boolean;
  /** A count on the item's corner (new things behind it); nothing when 0 or absent. */
  badge?: number;
  /** What the badge means, for screen readers ("1 new copy ready"). */
  badgeLabel?: string;
}

/** Above this the badge says "9+": it is a nudge, not a counter. */
const BADGE_MAX = 9;

/** What `renderLink` must spread onto the element it returns. */
export interface RailLinkProps {
  className?: string;
  style?: CSSProperties;
  /** Absent in `collapsed` mode, where the rail's own tooltip stands in for it. */
  title?: string;
  "aria-label"?: string;
  "aria-current"?: "page";
  /** Set in `collapsed` mode: they show and hide the tooltip. */
  onMouseEnter?: (event: MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (event: MouseEvent<HTMLElement>) => void;
  onFocus?: (event: FocusEvent<HTMLElement>) => void;
  onBlur?: (event: FocusEvent<HTMLElement>) => void;
  children: ReactNode;
}

/** The footer button that changes the rail's mode. The caller decides what "next" is. */
export interface RailModeToggle {
  /** Already translated; the button's accessible name. */
  label: string;
  /** The keyboard shortcut, shown in the title and tooltip ("⌘\\"). */
  hint?: string;
  icon: ReactNode;
  onToggle: () => void;
}

export interface RailProps<T extends RailItem = RailItem> {
  /**
   * The mark at the top, sized by the caller. Omit it where the window chrome already
   * shows the brand (the desktop's title bar): the rail then starts with its items.
   */
  brand?: ReactNode;
  brandTitle?: string;
  items: readonly T[];
  /**
   * Turns an item into a link element. Spread `props` onto it, e.g.
   * `(item, props) => <NavLink to={item.to} {...props} />`.
   */
  renderLink: (item: T, props: RailLinkProps) => ReactNode;
  /** An item pinned to the footer, drawn as a round avatar. */
  account?: T;
  /** Defaults to `stacked`. */
  mode?: RailMode;
  /** A button in the footer that changes the mode; none when absent. */
  modeToggle?: RailModeToggle;
  /** Consumer overrides, as StyleX styles rather than a className. */
  style?: StyleXStyles;
}

interface Tip {
  text: string;
  top: number;
  left: number;
}

export function Rail<T extends RailItem = RailItem>({
  brand,
  brandTitle,
  items,
  renderLink,
  account,
  mode = "stacked",
  modeToggle,
  style,
}: RailProps<T>) {
  const collapsed = mode === "collapsed";
  const row = mode === "expanded-row";
  const [tip, setTip] = useState<Tip | null>(null);
  // A tooltip belongs to the collapsed rail; switching mode with one open must not strand it.
  useEffect(() => setTip(null), [mode]);

  const tipHandlers = (text: string) => {
    if (!collapsed) return {};
    const show = (event: { currentTarget: HTMLElement }) => {
      const rect = event.currentTarget.getBoundingClientRect();
      setTip({ text, top: rect.top + rect.height / 2, left: rect.right + 8 });
    };
    const hide = () => setTip(null);
    return { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide };
  };

  const toggleText = modeToggle
    ? modeToggle.hint
      ? `${modeToggle.label} ${modeToggle.hint}`
      : modeToggle.label
    : "";

  return (
    <nav
      data-mode={mode}
      {...stylex.props(
        styles.rail,
        row ? styles.railExpanded : collapsed ? styles.railCollapsed : styles.railStacked,
        style,
      )}
    >
      {brand != null && (
        <div title={brandTitle} {...stylex.props(styles.brand)}>
          {brand}
        </div>
      )}

      <div {...stylex.props(styles.sections, row && styles.sectionsRow)}>
        {items.map((item) => {
          const { className, style: inline } = stylex.props(
            styles.item,
            row ? styles.itemExpanded : collapsed ? styles.itemCollapsed : styles.itemStacked,
            item.active && styles.itemActive,
          );
          return (
            <Fragment key={item.id}>
              {renderLink(item, {
                className,
                style: inline,
                ...(collapsed ? {} : { title: item.label }),
                "aria-current": item.active ? "page" : undefined,
                ...tipHandlers(item.label),
                children: (
                  <>
                    <span
                      aria-hidden
                      {...stylex.props(
                        styles.bar,
                        mode === "stacked" ? styles.barStacked : styles.barInset,
                        item.active && styles.barActive,
                      )}
                    />
                    <span
                      aria-hidden
                      {...stylex.props(styles.icon, item.active && styles.iconActive)}
                    >
                      {item.icon}
                    </span>
                    <span
                      {...stylex.props(
                        collapsed ? styles.srOnly : styles.label,
                        row && styles.labelExpanded,
                        mode === "stacked" && styles.labelStacked,
                      )}
                    >
                      {item.label}
                    </span>
                    {item.badge ? (
                      <>
                        <span
                          aria-hidden
                          {...stylex.props(
                            styles.badge,
                            row && styles.badgeRow,
                            collapsed && styles.badgeCollapsed,
                          )}
                        >
                          {item.badge > BADGE_MAX ? `${BADGE_MAX}+` : item.badge}
                        </span>
                        {item.badgeLabel ? (
                          <span {...stylex.props(styles.srOnly)}>{item.badgeLabel}</span>
                        ) : null}
                      </>
                    ) : null}
                  </>
                ),
              })}
            </Fragment>
          );
        })}
      </div>

      {account || modeToggle ? (
        <div {...stylex.props(styles.footer, row && styles.footerRow)}>
          {account
            ? renderLink(account, {
                ...stylex.props(styles.avatar),
                ...(collapsed ? {} : { title: account.label }),
                "aria-label": account.label,
                "aria-current": account.active ? "page" : undefined,
                ...tipHandlers(account.label),
                children: account.icon,
              })
            : null}
          {modeToggle ? (
            <button
              type="button"
              aria-label={modeToggle.label}
              {...(collapsed ? {} : { title: toggleText })}
              onClick={modeToggle.onToggle}
              {...tipHandlers(toggleText)}
              {...stylex.props(styles.toggle)}
            >
              {modeToggle.icon}
            </button>
          ) : null}
        </div>
      ) : null}

      {tip ? (
        <span
          role="tooltip"
          className={stylex.props(styles.tooltip).className}
          style={{ top: tip.top, left: tip.left }}
        >
          {tip.text}
        </span>
      ) : null}
    </nav>
  );
}
