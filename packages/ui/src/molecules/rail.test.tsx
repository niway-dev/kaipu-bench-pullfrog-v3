import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

/**
 * The collapsed rail's floating label. It repeats the link's own name, so it is visual only:
 * no tooltip role and hidden from assistive tech, which already reads the name once.
 */
const tip = (): HTMLElement | null => document.querySelector("[data-rail-tooltip]");
import { RAIL_MODES, Rail, type RailItem, type RailLinkProps } from "./rail";

interface LinkItem extends RailItem {
  to: string;
}

const items: LinkItem[] = [
  { id: "record", label: "Record", icon: <i data-testid="icon-record" />, to: "/", active: true },
  { id: "library", label: "Library", icon: <i data-testid="icon-library" />, to: "/library" },
];

describe("Rail", () => {
  it("renders each item through renderLink with its label and icon", () => {
    render(
      <Rail
        brand={<b>mark</b>}
        items={items}
        renderLink={(item, props) => <a href={item.to} {...props} />}
      />,
    );
    const link = screen.getByRole("link", { name: /library/i });
    expect(link).toHaveAttribute("href", "/library");
    expect(link).toHaveAttribute("title", "Library");
    expect(screen.getByTestId("icon-library")).toBeInTheDocument();
  });

  it("works with a non-routing element", () => {
    render(
      <Rail
        brand={null}
        items={items}
        renderLink={(item, props) => <span data-id={item.id} {...props} />}
      />,
    );
    expect(screen.getAllByText(/record|library/i)).toHaveLength(2);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("marks only the active item as the current page and styles it differently", () => {
    render(
      <Rail
        brand={null}
        items={items}
        renderLink={(item, props) => <a href={item.to} {...props} />}
      />,
    );
    const active = screen.getByRole("link", { name: /record/i });
    const idle = screen.getByRole("link", { name: /library/i });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(idle).not.toHaveAttribute("aria-current");
    expect(active.className).not.toBe(idle.className);
  });

  it("shows the brand with its title", () => {
    render(
      <Rail
        brand={<b>mark</b>}
        brandTitle="Kaipu Record"
        items={[]}
        renderLink={(_, props) => <span {...props} />}
      />,
    );
    expect(screen.getByTitle("Kaipu Record")).toHaveTextContent("mark");
  });

  it("draws no brand row when there is no brand", () => {
    const { container } = render(
      <Rail items={[]} brandTitle="Kaipu Record" renderLink={(_, props) => <span {...props} />} />,
    );
    expect(screen.queryByTitle("Kaipu Record")).toBeNull();
    expect(container.querySelector("nav")?.children).toHaveLength(1);
  });

  it("renders the account item in the footer, named by its label", () => {
    const account: LinkItem = { id: "account", label: "Account", icon: <i />, to: "/cloud" };
    render(
      <Rail
        brand={null}
        items={items}
        account={account}
        renderLink={(item, props) => <a href={item.to} {...props} />}
      />,
    );
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/cloud");
  });

  it("omits the footer when there is no account", () => {
    render(
      <Rail
        brand={null}
        items={items}
        renderLink={(item, props) => <a href={item.to} {...props} />}
      />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("shows a badge with its count and meaning, capped at 9+, and none at 0", () => {
    const { rerender } = render(
      <Rail
        brand={null}
        items={[{ ...items[1]!, badge: 2, badgeLabel: "2 new copies ready" }]}
        renderLink={(item, props) => <a href={item.to} {...props} />}
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent("2");
    expect(link).toHaveAccessibleName(/2 new copies ready/);
    rerender(
      <Rail
        brand={null}
        items={[{ ...items[1]!, badge: 12 }]}
        renderLink={(item, props) => <a href={item.to} {...props} />}
      />,
    );
    expect(screen.getByText("9+")).toBeInTheDocument();
    rerender(
      <Rail
        brand={null}
        items={[{ ...items[1]!, badge: 0 }]}
        renderLink={(item, props) => <a href={item.to} {...props} />}
      />,
    );
    expect(screen.getByRole("link")).toHaveTextContent(/^Library$/);
  });

  describe("modes (NIW2-626)", () => {
    const link = (item: LinkItem, props: RailLinkProps) => <a href={item.to} {...props} />;

    it("is stacked when no mode is given, so the landing mockup keeps its look", () => {
      const { container } = render(<Rail items={items} renderLink={link} />);
      expect(container.querySelector("nav")).toHaveAttribute("data-mode", "stacked");
    });

    it("stacked shows every label as text and names each link by it", () => {
      const { container } = render(<Rail mode="stacked" items={items} renderLink={link} />);
      expect(container.querySelector("nav")).toHaveAttribute("data-mode", "stacked");
      expect(screen.getByRole("link", { name: "Library" })).toHaveTextContent("Library");
      expect(tip()).toBeNull();
    });

    it("has exactly two modes, stacked and collapsed (the owner's call, NIW2-626)", () => {
      expect(RAIL_MODES).toEqual(["stacked", "collapsed"]);
    });

    it("collapsed keeps each link's accessible name with the label hidden", () => {
      const { container } = render(<Rail mode="collapsed" items={items} renderLink={link} />);
      expect(container.querySelector("nav")).toHaveAttribute("data-mode", "collapsed");
      const library = screen.getByRole("link", { name: "Library" });
      // No native title: the rail's own tooltip replaces it, so the two never stack.
      expect(library).not.toHaveAttribute("title");
    });

    it("the floating label is visual only: no tooltip role, hidden from screen readers", () => {
      render(<Rail mode="collapsed" items={items} renderLink={link} />);
      fireEvent.focus(screen.getByRole("link", { name: "Library" }));
      expect(screen.queryByRole("tooltip")).toBeNull();
      expect(tip()).toHaveAttribute("aria-hidden", "true");
      expect(screen.getByRole("link", { name: "Library" })).not.toHaveAttribute("aria-describedby");
    });

    it("collapsed shows a tooltip on hover and hides it on leave", () => {
      render(<Rail mode="collapsed" items={items} renderLink={link} />);
      const library = screen.getByRole("link", { name: "Library" });
      fireEvent.mouseEnter(library);
      expect(tip()).toHaveTextContent("Library");
      fireEvent.mouseLeave(library);
      expect(tip()).toBeNull();
    });

    it("collapsed shows the tooltip on keyboard focus too, and hides it on blur", () => {
      render(<Rail mode="collapsed" items={items} renderLink={link} />);
      const record = screen.getByRole("link", { name: "Record" });
      fireEvent.focus(record);
      expect(tip()).toHaveTextContent("Record");
      fireEvent.blur(record);
      expect(tip()).toBeNull();
    });

    it("has no toggle of its own: the desktop's lives in its title bar", () => {
      render(
        <Rail
          mode="collapsed"
          items={items}
          account={{ id: "account", label: "Account", icon: <i />, to: "/cloud" }}
          renderLink={link}
        />,
      );
      expect(screen.queryByRole("button")).toBeNull();
      expect(screen.getByRole("link", { name: "Account" })).toBeInTheDocument();
    });
  });

  it("animates its width only when asked to (a user's change, never the first paint)", () => {
    const { container, rerender } = render(
      <Rail
        mode="collapsed"
        items={items}
        renderLink={(item, props) => <a href={item.to} {...props} />}
      />,
    );
    const still = container.querySelector("nav")!.className;
    rerender(
      <Rail
        mode="collapsed"
        animate
        items={items}
        renderLink={(item, props) => <a href={item.to} {...props} />}
      />,
    );
    expect(container.querySelector("nav")!.className).not.toBe(still);
  });
});
